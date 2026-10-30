#!/usr/bin/env python3
"""Deterministic staging-only compose. No Docker, credentials or host mutations."""
import argparse
import ipaddress
import json
import re

ROOT = '/data/falcon-staging'
SUBNETS = ('172.30.241.0/24', '172.30.242.0/24')
HOSTS = ('staging-falcon.jataka.io', 'staging-apifalcon.jataka.io')
LIMITS = {'api': 768, 'frontend': 512, 'postgres': 512, 'redis': 128, 'mail': 64}
IMAGE = re.compile(r'(?:ghcr\.io/shodh-ai/falcon-staging-(?:backend|frontend)|postgres|redis|axllent/mailpit)@sha256:[0-9a-f]{64}')


def capacity(memory_available, disk_available, *, initial=False, candidate_mib=0, working_bytes=0):
    required = max(4096 if initial else 1536 + candidate_mib, 1536) * 1024**2
    if memory_available < required:
        raise ValueError('STAGING_MEMORY_HEADROOM')
    if disk_available < max(20 * 1024**3, 3 * working_bytes):
        raise ValueError('STAGING_DISK_HEADROOM')


def docker_subnets(networks):
    result=[]
    for network in networks:
        config=(network.get('IPAM') or {}).get('Config') or []
        if not isinstance(config,list):
            raise ValueError('DOCKER_IPAM_METADATA')
        for item in config:
            if item.get('Subnet'):
                ipaddress.ip_network(item['Subnet'])
                result.append(item['Subnet'])
    return result


def validate_subnets(existing):
    for proposed in SUBNETS:
        if any(ipaddress.ip_network(proposed).overlaps(ipaddress.ip_network(item))
               for item in existing if ipaddress.ip_network(item).version == 4):
            raise ValueError('STAGING_SUBNET_CONFLICT')


def pinned(image, repository):
    if not IMAGE.fullmatch(image) or not image.startswith(repository + '@'):
        raise ValueError('STAGING_IMMUTABLE_IMAGE_REQUIRED')
    return image


def mount(source, target, readonly=False):
    if not source.startswith(ROOT + '/') or '..' in source.split('/'):
        raise ValueError('STAGING_MOUNT_SCOPE')
    return {'type': 'bind', 'source': source, 'target': target, 'read_only': readonly,
            'bind': {'create_host_path': False}}


def build(images, *, applications=False):
    repositories = {
        'api': 'ghcr.io/shodh-ai/falcon-staging-backend',
        'frontend': 'ghcr.io/shodh-ai/falcon-staging-frontend',
        'postgres': 'postgres', 'redis': 'redis', 'mail': 'axllent/mailpit',
    }
    required=set(repositories) if applications else {'postgres','redis','mail'}
    if not required <= set(images) or set(images)-set(repositories):
        raise ValueError('STAGING_IMAGE_SCOPE')
    images = {name: pinned(value, repositories[name]) for name,value in images.items()}
    common = {'restart': 'no', 'read_only': True, 'cap_drop': ['ALL'],
              'security_opt': ['no-new-privileges:true'], 'pids_limit': 128, 'cpu_shares': 128,
              'sysctls': {'net.ipv6.conf.all.disable_ipv6': '1', 'net.ipv6.conf.default.disable_ipv6': '1'},
              'logging': {'driver': 'json-file', 'options': {'max-size': '5m', 'max-file': '2'}}}
    def service(name, uid, cpu, networks):
        return {**common, 'image': images[name], 'user': uid, 'cpus': cpu,
                'mem_limit': f'{LIMITS[name]}m', 'memswap_limit': f'{LIMITS[name]}m',
                'networks': networks,
                'tmpfs': [f'/tmp:rw,nosuid,nodev,size=64m,uid={uid.split(":")[0]},mode=0700']}
    pg = service('postgres', '70:70', 0.5, ['data'])
    pg['tmpfs'].append('/var/run/postgresql:rw,nosuid,nodev,size=16m,uid=70,gid=70,mode=3775')
    pg.update({'environment': {'POSTGRES_DB': 'falcon_staging', 'POSTGRES_USER': 'postgres',
                'POSTGRES_PASSWORD_FILE': '/run/secrets/owner-password',
                'POSTGRES_INITDB_ARGS': '--auth-local=trust --auth-host=scram-sha-256', 'PGDATA': '/var/lib/postgresql/18/docker'},
        'volumes': [mount(ROOT+'/postgres', '/var/lib/postgresql'),
                    mount(ROOT+'/private/postgres-password', '/run/secrets/owner-password', True)],
        'command': ['postgres', '-c', 'shared_buffers=64MB', '-c', 'max_connections=30',
                    '-c', 'work_mem=2MB', '-c', 'log_statement=none'],
        'healthcheck': {'test': ['CMD-SHELL', 'pg_isready -h 127.0.0.1 -U postgres -d falcon_staging'],
                       'interval': '10s', 'timeout': '3s', 'retries': 10}})
    redis = service('redis', '999:999', 0.1, ['data'])
    redis.update({'command': ['redis-server', '/run/secrets/redis.conf'],
                  'volumes': [mount(ROOT+'/redis', '/data'), mount(ROOT+'/private/redis.conf', '/run/secrets/redis.conf', True)]})
    mail = service('mail', '61002:61002', 0.1, ['data'])
    mail.update({'environment': {'MP_DATABASE': '/data/mailpit.db', 'MP_MAX_MESSAGES': '0',
                  'MP_SMTP_AUTH_ACCEPT_ANY': 'true', 'MP_SMTP_REQUIRE_STARTTLS': 'true',
                  'MP_SMTP_TLS_CERT': '/run/secrets/smtp-cert.pem', 'MP_SMTP_TLS_KEY': '/run/secrets/smtp-key.pem',
                  'MP_DISABLE_VERSION_CHECK': 'true', 'MP_BLOCK_REMOTE_CSS_AND_FONTS': 'true',
                  'MP_LABEL': 'FALCON STAGING — DUMMY DATA'},
                  'volumes': [mount(ROOT+'/mail', '/data'),
                    mount(ROOT+'/private/smtp-cert.pem', '/run/secrets/smtp-cert.pem', True),
                    mount(ROOT+'/private/smtp-key.pem', '/run/secrets/smtp-key.pem', True)]})
    services = {'falcon-staging-postgres': pg, 'falcon-staging-redis': redis, 'falcon-staging-mail': mail}
    if applications:
        api = service('api', '61001:61001', 0.5, ['ingress', 'data'])
        api.update({'environment': {
            'NODE_ENV': 'production', 'FALCON_ENVIRONMENT': 'staging', 'PORT': '4000',
            'NODE_OPTIONS': '--max-old-space-size=512',
            'DB_HOST': 'falcon-staging-postgres', 'DB_PORT': '5432', 'DB_DATABASE': 'falcon_staging',
            'DB_USERNAME': 'falcon_staging_runtime', 'DB_PASSWORD': '${STAGING_DB_PASSWORD}',
            'DB_SYNCHRONIZE': 'false', 'DB_POOL_MAX': '5', 'DB_POOL_MIN': '0',
            'REDIS_HOST': 'falcon-staging-redis', 'REDIS_PORT': '6379', 'REDIS_TLS': 'false',
            'REDIS_PASSWORD': '${STAGING_REDIS_PASSWORD}',
            'JWT_SECRET': '${STAGING_JWT_SECRET}', 'JWT_EXPIRATION': '2h',
            'HR_ENCRYPTION_KEY': '${STAGING_HR_ENCRYPTION_KEY}',
            'ACQUISITION_DATA_ENCRYPTION_KEY': '${STAGING_ACQUISITION_ENCRYPTION_KEY}',
            'EMAIL_HOST': 'falcon-staging-mail', 'EMAIL_PORT': '1025', 'EMAIL_SECURE': 'false',
            'EMAIL_USER': 'noreply.ums@mygyanvihar.com', 'EMAIL_PASSWORD': '${STAGING_EMAIL_PASSWORD}',
            'NODE_EXTRA_CA_CERTS': '/run/falcon/staging-smtp-ca.pem',
            'FRONTEND_URL': 'https://'+HOSTS[0], 'SAAS_BASE_DOMAIN': 'jataka.io',
            'DEDICATED_APP_HOSTS': ','.join(HOSTS), 'DEFAULT_TENANT_SUBDOMAIN': 'staging',
            'AUTH_PROVIDER': 'local', 'UPLOAD_PATH': '/app/uploads',
            'ALLOW_MOCK_PAYMENTS': 'true', 'STAGING_INTEGRATIONS_MODE': 'mock',
            'PORTAL_EMAIL_DELIVERY_ENABLED': 'true', 'PORTAL_NOTIFICATION_SCHEDULED_ALERTS_ENABLED': 'false',
            'PORTAL_NOTIFICATION_QUEUE_PREFIX': 'falcon-notification-staging',
            'PORTAL_NOTIFICATION_ACTIVATED_AFTER': '${STAGING_NOTIFICATION_CUTOFF}',
            }, 'volumes': [mount(ROOT+'/uploads', '/app/uploads'),
                           mount(ROOT+'/private/storage-boundary.json', '/run/falcon/storage-boundary.json', True),
                           mount(ROOT+'/private/smtp-ca.pem', '/run/falcon/staging-smtp-ca.pem', True),
                           mount(ROOT+'/private/access', '/run/falcon/staging-access', True)],
            'labels': {'traefik.enable': 'false'},
            'depends_on': {'falcon-staging-postgres': {'condition': 'service_healthy'},
                           'falcon-staging-redis': {'condition': 'service_started'},
                           'falcon-staging-mail': {'condition': 'service_started'}}})
        frontend = service('frontend', '1001:1001', 0.5, ['ingress'])
        frontend.update({'environment': {'NODE_ENV': 'production', 'FALCON_ENVIRONMENT': 'staging',
            'NEXT_PUBLIC_FALCON_ENVIRONMENT': 'staging',
            'NODE_OPTIONS': '--max-old-space-size=256 --require=/app/staging-runtime.cjs',
            'API_URL': 'https://'+HOSTS[1], 'NEXT_PUBLIC_API_URL': 'https://'+HOSTS[1],
            'INTERNAL_API_URL': 'http://falcon-staging-api:4000',
            'NEXT_PUBLIC_DEFAULT_TENANT_SUBDOMAIN': 'staging', 'NEXT_PUBLIC_SAAS_BASE_DOMAIN': 'jataka.io',
            'NEXT_PUBLIC_DEDICATED_APP_HOSTS': ','.join(HOSTS)},
            'labels': {'traefik.enable': 'false'}})
        frontend['tmpfs'].append('/app/.next-local/cache:rw,nosuid,nodev,size=64m,uid=1001,mode=0700')
        services.update({'falcon-staging-api': api, 'falcon-staging-frontend': frontend})
    return {'name': 'falcon-staging', 'services': services, 'networks': {
        'ingress': {'name': 'falcon-staging-ingress', 'internal': True,
                    'ipam': {'config': [{'subnet': SUBNETS[0], 'ip_range': '172.30.241.0/25'}]}},
        'data': {'name': 'falcon-staging-data', 'internal': True,
                 'ipam': {'config': [{'subnet': SUBNETS[1]}]}},
    }}


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--images',required=True,help='JSON file of reviewed image digests')
    parser.add_argument('--applications',action='store_true')
    args=parser.parse_args()
    with open(args.images) as stream: images=json.load(stream)
    print(json.dumps(build(images,applications=args.applications),indent=2))



def app_release(images, release_id):
    if not re.fullmatch(r'[0-9a-f]{16}',release_id):
        raise ValueError('STAGING_RELEASE_ID')
    complete=build(images,applications=True)
    services={name:value for name,value in complete['services'].items()
              if name in ('falcon-staging-api','falcon-staging-frontend')}
    for name,service in services.items():
        service['container_name']=name+'-'+release_id
        service['environment']['FALCON_RELEASE_ID']=release_id
        service['labels']={'traefik.enable':'false','io.falcon.environment':'staging',
                           'io.falcon.release':release_id}
        service.pop('depends_on',None)
    services['falcon-staging-frontend']['environment']['INTERNAL_API_URL']='http://falcon-staging-api-'+release_id+':4000'
    return {'name':'falcon-staging-release-'+release_id,'services':services,
            'networks':{name:{'external':True,'name':'falcon-staging-'+name} for name in ('ingress','data')}}


def route_document(release_id, access_hash):
    if not re.fullmatch(r'[0-9a-f]{16}',release_id):raise ValueError('STAGING_RELEASE_ID')
    if not re.fullmatch(r'staging-owner:\$2[aby]\$12\$[./A-Za-z0-9]{53}',access_hash):
        raise ValueError('STAGING_UI_AUTH_HASH')
    routers={};services={}
    for name,host,port,container in [('web',HOSTS[0],3000,'frontend'),('api',HOSTS[1],4000,'api')]:
        key='falcon-staging-'+name
        routers[key]={'rule':'Host(`'+host+'`)','entryPoints':['https'],'service':key,
                      'tls':{'certResolver':'letsencrypt'}}
        if name=='web':routers[key]['middlewares']=['falcon-staging-access']
        services[key]={'loadBalancer':{'servers':[{'url':'http://falcon-staging-'+container+'-'+release_id+':'+str(port)}]}}
    routers['falcon-staging-http']={'rule':' || '.join('Host(`'+host+'`)' for host in HOSTS),
        'entryPoints':['http'],'middlewares':['falcon-staging-https'],'service':'noop@internal'}
    return {'http':{'routers':routers,'services':services,'middlewares':{
        'falcon-staging-access':{'basicAuth':{'users':[access_hash],'removeHeader':True}},
        'falcon-staging-https':{'redirectScheme':{'scheme':'https','permanent':True}}}}}


if __name__=='__main__':main()

<?php
// Host-maintenance stdin adapter. No API token and no production resource update.
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

function refuseUnless(bool $value): void {
    if (!$value) throw new RuntimeException('STAGING_COOLIFY_SCOPE');
}
try {
    $raw=stream_get_contents(STDIN,1048577);
    refuseUnless(strlen($raw)<=1048576);
    $input=json_decode($raw,true,512,JSON_THROW_ON_ERROR);
    refuseUnless(in_array($input['action']??'', ['create','sync'],true));
    $compose=$input['compose']??null;
    refuseUnless(is_array($compose) && isset($compose['services']) && is_array($compose['services']));
    $allowed=['falcon-staging-postgres','falcon-staging-redis','falcon-staging-mail','falcon-staging-api','falcon-staging-frontend'];
    refuseUnless(count($compose['services'])>=3 && count($compose['services'])<=5);
    foreach($compose['services'] as $name=>$service) {
        refuseUnless(in_array($name,$allowed,true));
        refuseUnless(empty($service['privileged']) && empty($service['build']) && empty($service['ports']) && empty($service['network_mode']) && empty($service['devices']) && empty($service['cap_add']));
        refuseUnless(preg_match('/^(postgres|redis|axllent\/mailpit|ghcr\.io\/shodh-ai\/falcon-staging-(backend|frontend))@sha256:[0-9a-f]{64}$/',$service['image']??'')===1);
        foreach($service['volumes']??[] as $volume) {
            refuseUnless(is_array($volume) && ($volume['type']??'')==='bind' &&
                str_starts_with($volume['source']??'','/data/falcon-staging/') &&
                !in_array('..',explode('/',$volume['source']),true));
        }
    }
    Illuminate\Support\Facades\DB::beginTransaction();
    if($input['action']==='create') {
        refuseUnless(!App\Models\Project::where('name','FALCON Staging')->exists());
        $project=App\Models\Project::create(['name'=>'FALCON Staging','description'=>'Isolated synthetic-data QA. Production deployment is manual.','team_id'=>0]);
        $environment=$project->environments()->create(['name'=>'staging','description'=>'Dummy data only']);
        $service=App\Models\Service::create([
            'name'=>'FALCON Staging','description'=>'Guarded cloud-image staging; use the staging deployment controller.',
            'environment_id'=>$environment->id,'server_id'=>0,
            'destination_type'=>App\Models\StandaloneDocker::class,'destination_id'=>0,
            'connect_to_docker_network'=>false,'compose_parsing_version'=>3,
            'include_coolify_default_variables'=>false,'redact_all_env_values_in_logs'=>true,
            'docker_compose_raw'=>json_encode($compose,JSON_THROW_ON_ERROR),
        ]);
    } else {
        refuseUnless(preg_match('/^[a-z0-9]{16,64}$/',$input['service_uuid']??'')===1);
        $service=App\Models\Service::where('uuid',$input['service_uuid'])->firstOrFail();
        $environment=$service->environment;
        $project=$environment->project;
        refuseUnless($project->name==='FALCON Staging' && $project->team_id===0 &&
            $environment->name==='staging' && $service->name==='FALCON Staging' && $service->server_id===0);
        $service->docker_compose_raw=json_encode($compose,JSON_THROW_ON_ERROR);
        $service->include_coolify_default_variables=false;
        $service->connect_to_docker_network=false;
        $service->redact_all_env_values_in_logs=true;
        $service->save();
    }
    foreach($input['environment']??[] as $key=>$value) {
        refuseUnless(preg_match('/^STAGING_[A-Z0-9_]+$/',$key)===1 && is_string($value) && !preg_match('/[\r\n\x00]/',$value));
        $fields=['value'=>$value,'is_buildtime'=>false,'is_runtime'=>true];
        if(Illuminate\Support\Facades\Schema::hasColumn('environment_variables','is_literal'))$fields['is_literal']=true;
        $service->environment_variables()->updateOrCreate(['key'=>$key],$fields);
    }
    $service->parse($input['action']==='create');
    $service->refresh();
    $parsed=parseDockerComposeYaml($service->docker_compose);
    $labels=[];
    foreach($parsed['services']??[] as $name=>$definition) {
        $labels[$name]=[];
        foreach($definition['labels']??[] as $key=>$value) {
            if(is_int($key)) { [$key,$value]=array_pad(explode('=',$value,2),2,''); }
            if(str_starts_with($key,'coolify.'))$labels[$name][$key]=$value;
        }
    }
    Illuminate\Support\Facades\DB::commit();
    echo json_encode(['service_uuid'=>$service->uuid,'service_id'=>$service->id,
        'project_uuid'=>$project->uuid,'environment_uuid'=>$environment->uuid,'coolify_labels'=>$labels],JSON_THROW_ON_ERROR);
} catch(Throwable $error) {
    Illuminate\Support\Facades\DB::rollBack();
    // SQL and parser exceptions can contain credentials: never print them.
    fwrite(STDERR,json_encode(['code'=>'STAGING_COOLIFY_ADAPTER_REFUSED','exception_class'=>get_class($error),'exception_code'=>(string)$error->getCode()])."\n");
    exit(1);
}

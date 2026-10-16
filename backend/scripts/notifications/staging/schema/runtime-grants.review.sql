-- REVIEW ONLY: existing restricted roles and exact reviewed base schema required.
-- No owner/DDL, provisioning, password, DELETE, sequence or audit UPDATE rights.
GRANT CONNECT ON DATABASE falcon_notification_staging TO notification_staging_app;
GRANT USAGE ON SCHEMA public TO notification_staging_app;
GRANT SELECT ON TABLE public.notification_staging_environment,public.tenants,public.tenant_subscriptions,public.roles,public.campuses,public.schools,public.departments,public.org_entities,public.users,public.user_roles,public.user_entity_access,public.hr_permissions,public.hr_access_controls,public.falcon_notifications TO notification_staging_app;
GRANT INSERT ON TABLE public.user_roles,public.falcon_notifications TO notification_staging_app;
GRANT UPDATE (last_login_at,account_status,updated_at) ON TABLE public.users TO notification_staging_app;
GRANT UPDATE (is_primary,deleted_at) ON TABLE public.user_roles TO notification_staging_app;
GRANT UPDATE (metadata,is_read,read_at,deleted_at) ON TABLE public.falcon_notifications TO notification_staging_app;
GRANT INSERT (tenant_id,user_id,email,success) ON TABLE public.admin_login_history TO notification_staging_app;
GRANT INSERT (tenant_id,actor_user_id,action,resource_type,resource_id,details) ON TABLE public.admin_control_audit TO notification_staging_app;

export interface AuthUser {
  user_id: string;
  email: string;
  name: string;
  role: string;
  roles?: string[];
  primaryRole?: string;
  role_id?: number;
  department?: string;
  dept_id?: number;
  tenant_id?: string;
  tenant_schema?: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface DeviceTokenPayload {
  device_token: string;
}

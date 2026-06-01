import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class AdminOpsService {
  constructor(private readonly dataSource: DataSource) {}

  assets() {
    return this.dataSource.query(
      `SELECT a.*, u.name AS assigned_user_name
       FROM university_assets a
       LEFT JOIN users u ON u.user_id = a.assigned_user_id
       ORDER BY a.created_at DESC`,
    );
  }

  visitors() {
    return this.dataSource.query(
      `SELECT v.*, u.name AS visiting_user_name
       FROM visitor_logs v
       LEFT JOIN users u ON u.user_id = v.visiting_user_id
       ORDER BY v.entry_time DESC`,
    );
  }

  fleet() {
    return this.dataSource.query(
      `SELECT f.*, driver.name AS driver_name
       FROM fleet_vehicles f
       LEFT JOIN users driver ON driver.user_id = f.driver_user_id
       ORDER BY f.registration_no ASC`,
    );
  }

  fuelLogs() {
    return this.dataSource.query(
      `SELECT l.*, v.registration_no
       FROM fleet_fuel_logs l
       JOIN fleet_vehicles v ON v.vehicle_id = l.vehicle_id
       ORDER BY l.fuel_date DESC`,
    );
  }
}

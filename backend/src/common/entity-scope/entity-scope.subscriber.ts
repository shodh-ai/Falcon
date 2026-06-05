import {
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
  UpdateEvent,
} from 'typeorm';
import { ForbiddenException } from '@nestjs/common';
import { EntityScopeContext } from './entity-scope.context';

/** Tables that participate in logical entity separation. */
const ENTITY_SCOPED_TABLES = new Set([
  'users',
  'academic_courses',
  'academic_timetables',
  'student_course_enrollments',
  'hr_shifts',
  'hr_leave_policies',
  'hr_employee_profiles',
  'hr_holidays',
  'hr_attendance_rules',
  'hr_dynamic_rules',
  'hr_org_units',
  'hr_approval_workflows',
  'hr_workflow_checklists',
  'hr_policy_documents',
  'hr_onboarding_pipelines',
  'hr_resignation_requests',
  'staff_leave_requests',
  'hr_shift_allocations',
  'hr_penalty_trackers',
  'hr_payroll_deductions',
]);

@EventSubscriber()
export class EntityScopeSubscriber implements EntitySubscriberInterface {
  beforeInsert(event: InsertEvent<Record<string, unknown>>) {
    const table = event.metadata.tableName;
    if (!ENTITY_SCOPED_TABLES.has(table)) return;

    const scopeId = EntityScopeContext.getEntityId();
    if (!scopeId) return;

    const entity = event.entity;
    if (!entity || typeof entity !== 'object') return;

    if (entity.entity_id == null || entity.entity_id === '') {
      entity.entity_id = scopeId;
    } else if (Number(entity.entity_id) !== scopeId) {
      throw new ForbiddenException('Cannot insert data for an entity outside your current scope.');
    }
  }

  beforeUpdate(event: UpdateEvent<Record<string, unknown>>) {
    const table = event.metadata.tableName;
    if (!ENTITY_SCOPED_TABLES.has(table)) return;

    const scopeId = EntityScopeContext.getEntityId();
    if (!scopeId) return;

    const rowEntityId = event.entity?.entity_id ?? event.databaseEntity?.entity_id;
    if (rowEntityId != null && Number(rowEntityId) !== scopeId) {
      throw new ForbiddenException('Cannot update data belonging to another organization entity.');
    }

    if (event.entity && event.entity.entity_id == null) {
      event.entity.entity_id = scopeId;
    }
  }
}

import importlib.util
import unittest
from datetime import date, timedelta
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("prepare-pharmacy-migration.py")
SPEC = importlib.util.spec_from_file_location("pharmacy_migration", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PharmacyMigrationReadinessTest(unittest.TestCase):
    def fixtures(self):
        subjects = [{"course_code": "BP101T"}]
        faculty = [{"hr_reconciliation_status": "MATCHED_ACTIVE"}]
        allocations = [{"course_code": "BP101T"}]
        students = [{
            "official_email": "student@mygyanvihar.com",
            "admission_route": "REGULAR",
            "current_term": 1,
            "programme_id": "BPHARM",
            "cohort_id": "BPHARM-2026",
            "section_id": "A",
            "curriculum_scheme_id": "PCI-2026",
        }]
        start = date(2026, 7, 1)
        calendar_days = [
            {"calendar_date": (start + timedelta(days=offset)).isoformat()}
            for offset in range(365)
        ]
        approvals = {
            "calendar_approved": True,
            "calendar_events_structured": True,
            "continuing_students_reconciled": True,
            "lms_history_reconciled": True,
            "programme_structure_complete": True,
            "production_directory_verified": True,
            "seed_supersession_approved": True,
            "dry_run_accepted": True,
            "security_tests_passed": True,
        }
        return subjects, faculty, allocations, students, calendar_days, approvals

    def test_missing_evidence_fails_closed(self):
        subjects, faculty, allocations, students, days, _ = self.fixtures()
        result = MODULE.build_readiness(
            subjects, faculty, allocations, [], students, [], days, [],
            False, False, [], {},
        )
        self.assertFalse(result["ready_for_production_import"])
        self.assertIn(
            "FACULTY_HR_RECONCILIATION_REQUIRED",
            {item["code"] for item in result["blockers"]},
        )

    def test_complete_evidence_can_open_the_gate(self):
        subjects, faculty, allocations, students, days, approvals = self.fixtures()
        result = MODULE.build_readiness(
            subjects, faculty, allocations, [], students, [], days,
            [{"type": "CALENDAR_TITLE_YEAR_MISMATCH", "value": "2025-26"}],
            True, True,
            [{"course_code": "BP101T", "conflict_type": "COURSE_NAME"}],
            approvals,
        )
        self.assertTrue(result["ready_for_production_import"])
        self.assertEqual([], result["blockers"])
        self.assertEqual(0, result["checks"]["password_fields_exported"])


if __name__ == "__main__":
    unittest.main()

"""Offline regressions for deployment guidance, never an authorization gate.

Only repository documents and the dependency-free resource guard are loaded.
The guard receives a synthetic filesystem; no host, Docker or database is probed.
The shell-recipe lint covers known unsafe shortcuts, not arbitrary shell safety.
"""

import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[3]
OPERATOR_GUIDES = (
    "DEPLOYMENT_GUIDE.md",
    "COOLIFY_RESOURCE_GUARDRAILS.md",
    "PREBUILT_IMAGE_DEPLOYMENT.md",
    "STAGING_READINESS.md",
)
SHELL_BLOCK = re.compile(r"^```(?:bash|sh|shell)\s*\n(.*?)^```\s*$", re.M | re.S)
UNREVIEWED_SHORTCUT = re.compile(
    r"\bnpm\s+run\s+(?:db:(?:migrate|seed|sync)(?::[\w-]+)?|postdeploy:[\w-]+|start:prod)\b"
    r"|\bnode\s+\S*(?:apply-all-migrations|run-migrations|deploy-migrate|sync-schema)\.(?:js|cjs)\b"
    r"|\b(?:psql|pg_restore|createdb|dropdb)\b"
    r"|\bgh\s+workflow\s+run\b"
)


def unsafe_recipes(markdown):
    """Find executable recipes; inline review references remain permitted."""
    recipes = []
    for block in SHELL_BLOCK.findall(markdown):
        # Join shell continuations, ignore comments, then inspect each recipe.
        for line in re.sub(r"\\\n", " ", block).splitlines():
            if line.lstrip().startswith("#"):
                continue
            if UNREVIEWED_SHORTCUT.search(line):
                recipes.append(line.strip())
    return recipes


class DeploymentDocumentationTests(unittest.TestCase):
    def test_operator_guides_do_not_supply_unreviewed_execution_shortcuts(self):
        # Developer-local commands are outside this operator-guide policy.
        for name in OPERATOR_GUIDES:
            with self.subTest(document=name):
                self.assertEqual(unsafe_recipes((ROOT / "docs" / name).read_text()), [])

    def test_recipe_lint_catches_historical_database_and_release_shortcuts(self):
        for command in (
            "npm run db:migrate",
            "cd backend && npm run db:migrate:repair",
            "npm run db:seed",
            "npm run postdeploy:me",
            "npm run start:prod",
            "node scripts/apply-all-migrations.js",
            "node scripts/deploy-migrate.js",
            "psql -f baseline.sql",
            "pg_restore backup.dump",
            "createdb staging",
            "dropdb staging",
            "gh workflow run promote-production-images.yml",
            "npm run " + "\\" + "\n  db:migrate",
        ):
            with self.subTest(command=command):
                self.assertTrue(unsafe_recipes(f"```bash\n{command}\n```\n"))

    def test_review_references_and_offline_test_commands_remain_allowed(self):
        markdown = (
            "Review `backend/scripts/deploy-migrate.js`; do not execute it.\n"
            "```sh\n# Do not run npm run db:migrate\n"
            "node --test backend/scripts/deploy-migrate.spec.cjs\n"
            "python3 -B -m unittest discover -s ops/deployment-safety/tests -v\n```\n"
        )
        self.assertEqual(unsafe_recipes(markdown), [])

    def test_documented_disk_threshold_matches_executable_guard(self):
        document = (ROOT / "docs/COOLIFY_RESOURCE_GUARDRAILS.md").read_text()
        threshold = re.search(
            r"At least \*\*(\d+) GiB\*\* available on each filesystem backing "
            r"`/app` and `/app/uploads`", document
        )
        self.assertIsNotNone(threshold, "Document the resource guard's disk minimum")
        disk_bytes = int(threshold.group(1)) * 1024 ** 3
        node = shutil.which("node")
        self.assertIsNotNone(node, "Node is required to verify the executable contract")
        script = r"""
const {assertResourceBoundary} = require(process.argv[1]);
const documentedBytes = BigInt(process.argv[2]);
function accepts(pathBelowMinimum) {
  const fsApi = {
    readFileSync(path) {
      if (path === '/sys/fs/cgroup/memory.max') return String(1024 ** 3);
      if (path === '/proc/meminfo') return 'MemAvailable: 2097152 kB\n';
      throw new Error('Unexpected read');
    },
    statfsSync(path) {
      if (!['/app', '/app/uploads'].includes(path)) throw new Error('Unexpected stat');
      return {bavail: documentedBytes - (path === pathBelowMinimum ? 1n : 0n), bsize: 1n};
    }
  };
  try { assertResourceBoundary({fsApi}); return true; }
  catch { return false; }
}
process.stdout.write(JSON.stringify([
  accepts(null), accepts('/app'), accepts('/app/uploads')
]));
"""
        output = subprocess.check_output(
            [node, "-e", script, str(ROOT / "backend/scripts/resource-boundary.cjs"),
             str(disk_bytes)],
            cwd=ROOT, env={"PATH": os.defpath}, text=True, timeout=10,
        )
        self.assertEqual(json.loads(output), [True, False, False],
                         "Documented minimum must pass; one byte less on either mount must refuse")

    def test_operator_guides_preserve_the_docker_startup_command(self):
        dockerfile = (ROOT / "backend/Dockerfile").read_text()
        commands = re.findall(r"^CMD\s+(\[.*\])\s*$", dockerfile, re.M)
        self.assertTrue(commands, "Backend Dockerfile must retain its runtime command")
        command = " ".join(json.loads(commands[-1]))
        for name in OPERATOR_GUIDES:
            with self.subTest(document=name):
                self.assertIn(f"`{command}`", (ROOT / "docs" / name).read_text())


if __name__ == "__main__":
    unittest.main()

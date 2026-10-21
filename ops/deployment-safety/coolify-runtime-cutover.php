<?php
declare(strict_types=1);

/* REVIEWED PROPOSAL ONLY; no deployment is triggered by this script.
 * Run from the INSPECTED Coolify Laravel application working directory.
 * Payload and snapshots stay in server-side stdin/private files, never argv.
 * COMMON INPUT: mode, application_uuid, expected_env_rows, runtime_role,
 *               expected_guard_row, new_guard_source.
 * CUTOVER additionally requires runtime_password.
 * ROLLBACK additionally requires restore_env_rows.
 * Row arrays are exact getRawOriginal() attributes, not model->toArray().
 * expected_env_rows is ALL current production rows (not preview rows).
 * Rollback expected_env_rows must be a fresh saved POST-cutover raw snapshot;
 * restore_env_rows is the preserved PRE-cutover production snapshot.
 * expected_guard_row is the exact current LocalFileVolume raw row. For
 * rollback it must be a fresh saved POST-cutover row; new_guard_source names
 * the preserved PRE-cutover host file. Neither host file is modified here.
 * Snapshot files must already exist root0600 outside application mounts.
 * DB role creation/proof and new owner-controlled policy-file creation and
 * validation are separate operations. The new file must exist before use.
 */

ini_set('display_errors', '0');
ini_set('log_errors', '0');
set_error_handler(static function (): never {
    throw new RuntimeException('Operation verification failed');
});

function checked(bool $condition): void
{
    if (! $condition) {
        throw new RuntimeException('Operation verification failed');
    }
}

function canonicalRows(array $rows): array
{
    $byId = [];
    foreach ($rows as $row) {
        checked(is_array($row) && isset($row['id'], $row['key'], $row['resourceable_type'], $row['resourceable_id']));
        checked(is_int($row['id']) || (is_string($row['id']) && ctype_digit($row['id'])));
        $id = (string) $row['id'];
        checked($id !== '0' && ! array_key_exists($id, $byId));
        // Raw Eloquent environment attributes are scalar/null database columns.
        foreach ($row as $key => $value) {
            checked(is_string($key) && (is_scalar($value) || is_null($value)));
        }
        ksort($row, SORT_STRING);
        $byId[$id] = $row;
    }
    checked(count($byId) > 0);
    ksort($byId, SORT_STRING);
    return $byId;
}

function fingerprint(array $rows): string
{
    return hash('sha256', json_encode(canonicalRows($rows), JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES));
}

function rawRows($models): array
{
    return $models->map(static fn ($model): array => $model->getRawOriginal())->all();
}

function sameRows(array $left, array $right): bool
{
    // Empty preview/unrelated collections are valid; canonicalRows itself
    // requires nonempty production snapshots to reject an absent environment.
    if ($left === [] || $right === []) {
        return $left === [] && $right === [];
    }
    return hash_equals(fingerprint($left), fingerprint($right));
}

function canonicalMountRows(array $rows): array
{
    $byId = [];
    foreach ($rows as $row) {
        checked(is_array($row) && isset($row['id'], $row['resource_type'], $row['resource_id']));
        checked(is_int($row['id']) || (is_string($row['id']) && ctype_digit($row['id'])));
        $id = (string) $row['id'];
        checked($id !== '0' && ! array_key_exists($id, $byId));
        foreach ($row as $key => $value) {
            checked(is_string($key) && (is_scalar($value) || is_null($value)));
        }
        ksort($row, SORT_STRING);
        $byId[$id] = $row;
    }
    ksort($byId, SORT_STRING);
    return $byId;
}

function sameMountRows(array $left, array $right): bool
{
    $encode = static fn (array $rows): string => json_encode(
        canonicalMountRows($rows), JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
    return hash_equals(hash('sha256', $encode($left)), hash('sha256', $encode($right)));
}

function supportedGuardSource($source): bool
{
    return is_string($source) && ($source === '/etc/falcon-deployment-safety/storage-boundary.json' ||
        preg_match('~\A/etc/falcon-deployment-safety/policies/storage-boundary-[0-9a-f]{32}\.json\z~', $source) === 1);
}

function databaseBoolean($value): bool
{
    checked(in_array($value, [true, false, 1, 0, '1', '0'], true));
    return $value === true || $value === 1 || $value === '1';
}

function productionScope(array $rows, $application): void
{
    foreach ($rows as $row) {
        checked($row['resourceable_type'] === $application->getMorphClass());
        checked((string) $row['resourceable_id'] === (string) $application->getKey());
        checked(array_key_exists('is_preview', $row) && ! databaseBoolean($row['is_preview']));
    }
}

function targets($production): array
{
    $result = [];
    foreach (['DB_USERNAME', 'DB_PASSWORD', 'DB_USER'] as $key) {
        $found = $production->filter(static fn ($row): bool => $row->key === $key)->values();
        checked($found->count() === ($key === 'DB_USER' ? min(1, $found->count()) : 1));
        if ($found->count() === 1) {
            $result[$key] = $found[0];
        }
    }
    return $result;
}

function unrelated(array $rows, array $targetIds): array
{
    return array_values(array_filter($rows,
        static fn (array $row): bool => ! in_array((string) $row['id'], $targetIds, true)));
}

function immutableTargetAttributes(array $before, array $after): bool
{
    $allowed = ['value', 'is_runtime', 'is_buildtime', 'is_literal',
                'is_multiline', 'is_shared', 'updated_at'];
    foreach ($allowed as $key) {
        unset($before[$key], $after[$key]);
    }
    ksort($before, SORT_STRING);
    ksort($after, SORT_STRING);
    return $before === $after;
}

function guardScope(array $row, $application): void
{
    checked($row['resource_type'] === $application->getMorphClass());
    checked((string) $row['resource_id'] === (string) $application->getKey());
    checked(($row['mount_path'] ?? null) === '/run/falcon/storage-boundary.json:ro');
    checked(array_key_exists('is_host_file', $row) && databaseBoolean($row['is_host_file']));
    checked(array_key_exists('is_directory', $row) && ! databaseBoolean($row['is_directory']));
    checked(array_key_exists('content', $row) && $row['content'] === null);
    checked(supportedGuardSource($row['fs_path'] ?? null));
}

function immutableGuardAttributes(array $before, array $after): bool
{
    // Eloquent may update its timestamp; all other mount fields stay exact.
    unset($before['fs_path'], $before['updated_at'], $after['fs_path'], $after['updated_at']);
    ksort($before, SORT_STRING);
    ksort($after, SORT_STRING);
    return $before === $after;
}

try {
    $input = stream_get_contents(STDIN, 2 * 1024 * 1024 + 1);
    checked(is_string($input) && strlen($input) <= 2 * 1024 * 1024);
    $payload = json_decode($input, true, 64, JSON_THROW_ON_ERROR);
    checked(is_array($payload) && in_array($payload['mode'] ?? null, ['cutover', 'rollback'], true));
    $mode = $payload['mode'];
    $required = ['mode', 'application_uuid', 'expected_env_rows', 'runtime_role',
                 'expected_guard_row', 'new_guard_source',
                 $mode === 'cutover' ? 'runtime_password' : 'restore_env_rows'];
    $keys = array_keys($payload);
    sort($required);
    sort($keys);
    checked($keys === $required);
    checked(is_string($payload['application_uuid']) &&
        preg_match('/\A[A-Za-z0-9_-]{1,80}\z/', $payload['application_uuid']) === 1);
    checked(is_string($payload['runtime_role']) &&
        preg_match('/\A[a-z_][a-z0-9_]{0,62}\z/', $payload['runtime_role']) === 1 &&
        $payload['runtime_role'] !== 'postgres' && ! str_starts_with($payload['runtime_role'], 'pg_'));
    checked(is_array($payload['expected_env_rows']));
    canonicalRows($payload['expected_env_rows']);
    checked(is_array($payload['expected_guard_row']));
    canonicalMountRows([$payload['expected_guard_row']]);
    checked(supportedGuardSource($payload['new_guard_source']));
    checked(($payload['expected_guard_row']['fs_path'] ?? null) !== $payload['new_guard_source']);
    if ($mode === 'cutover') {
        // Generated server-side URL-safe/hex secret avoids interpolation and
        // whitespace trimming. Never accept a password in process arguments.
        checked(is_string($payload['runtime_password']) &&
            preg_match('/\A[A-Za-z0-9_-]{32,256}\z/', $payload['runtime_password']) === 1);
    } else {
        checked(is_array($payload['restore_env_rows']));
        canonicalRows($payload['restore_env_rows']);
    }

    // No container, database or Laravel-root path is guessed here. The owner
    // invokes this from the already inspected Coolify application directory.
    require getcwd().'/vendor/autoload.php';
    $laravel = require getcwd().'/bootstrap/app.php';
    $laravel->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();

    $result = \Illuminate\Support\Facades\DB::transaction(static function () use ($payload, $mode): array {
        $application = \App\Models\Application::query()
            ->where('uuid', $payload['application_uuid'])->lockForUpdate()->sole();
        $query = static fn () => \App\Models\EnvironmentVariable::query()
            ->where('resourceable_type', $application->getMorphClass())
            ->where('resourceable_id', $application->getKey())->orderBy('id');
        $all = $query()->lockForUpdate()->get();
        $production = $all->filter(static fn ($row): bool => ! $row->is_preview)->values();
        $preview = $all->filter(static fn ($row): bool => (bool) $row->is_preview)->values();
        $before = rawRows($production);
        $beforePreview = rawRows($preview);
        productionScope($payload['expected_env_rows'], $application);
        checked(sameRows($before, $payload['expected_env_rows']));

        // Lock every app mount, compare the exact expected host-file row, and
        // verify unrelated file/persistent rows again before the same commit.
        $fileQuery = static fn () => \App\Models\LocalFileVolume::query()
            ->where('resource_type', $application->getMorphClass())
            ->where('resource_id', $application->getKey())->orderBy('id');
        $volumeQuery = static fn () => \App\Models\LocalPersistentVolume::query()
            ->where('resource_type', $application->getMorphClass())
            ->where('resource_id', $application->getKey())->orderBy('id');
        $files = $fileQuery()->lockForUpdate()->get();
        $beforeFiles = rawRows($files);
        $beforeVolumes = rawRows($volumeQuery()->lockForUpdate()->get());
        guardScope($payload['expected_guard_row'], $application);
        $guards = $files->filter(static fn ($row): bool =>
            $row->mount_path === '/run/falcon/storage-boundary.json:ro')->values();
        checked($guards->count() === 1);
        $guard = $guards[0];
        $beforeGuard = $guard->getRawOriginal();
        checked(sameMountRows([$beforeGuard], [$payload['expected_guard_row']]));
        $guardIds = [(string) $guard->getKey()];
        $selected = targets($production);
        $targetIds = array_map(static fn ($row): string => (string) $row->getKey(), array_values($selected));
        $expectedRole = $mode === 'cutover' ? 'postgres' : $payload['runtime_role'];
        checked($selected['DB_USERNAME']->value === $expectedRole);
        if (isset($selected['DB_USER'])) {
            checked($selected['DB_USER']->value === $expectedRole);
        }
        checked(is_string($selected['DB_PASSWORD']->value) && $selected['DB_PASSWORD']->value !== '');

        if ($mode === 'cutover') {
            foreach ($selected as $key => $row) {
                $row->value = $key === 'DB_PASSWORD' ? $payload['runtime_password'] : $payload['runtime_role'];
                $row->is_runtime = true;
                $row->is_buildtime = false;
                $row->is_literal = true;
                $row->is_multiline = false;
                // Hydrated model ->save applies encryption/setters/events.
                // Never replace this with query-builder plaintext update.
                $row->saveOrFail();
            }
        } else {
            productionScope($payload['restore_env_rows'], $application);
            $restore = canonicalRows($payload['restore_env_rows']);
            checked(array_keys($restore) === array_keys(canonicalRows($before)));
            checked(sameRows(unrelated($before, $targetIds), unrelated(array_values($restore), $targetIds)));
            foreach ($selected as $key => $row) {
                $old = $restore[(string) $row->getKey()];
                checked($old['key'] === $key && immutableTargetAttributes($old, $row->getRawOriginal()));
                checked(is_string($old['value'] ?? null));
                $plain = decrypt($old['value']);
                checked(is_string($plain) && ($key === 'DB_PASSWORD' ? $plain !== '' : $plain === 'postgres'));
                unset($plain);
                $updates = $old;
                foreach (['id', 'uuid', 'resourceable_type', 'resourceable_id', 'key', 'created_at'] as $immutable) {
                    unset($updates[$immutable]);
                }
                // DELIBERATE RAW ROLLBACK: these are preserved encrypted bytes,
                // not plaintext. Query Builder bypasses encryption and automatic
                // timestamps so the exact old raw attributes can be restored.
                checked($row->getConnection()->table($row->getTable())
                    ->where($row->getKeyName(), $row->getKey())
                    ->where('resourceable_type', $application->getMorphClass())
                    ->where('resourceable_id', $application->getKey())
                    ->where('is_preview', false)->where('key', $key)->update($updates) === 1);
            }
        }

        // v4.4.6 has no LocalFileVolume updated hook. Its creation save job
        // and explicit storage methods skip host files. Do not invoke those
        // methods or change content/is_host_file: both existing host files
        // retain their bytes and inode, including for old-container restarts.
        $guard->fs_path = $payload['new_guard_source'];
        checked(array_keys($guard->getDirty()) === ['fs_path']);
        $guard->saveOrFail();

        $afterAll = $query()->lockForUpdate()->get();
        $afterProduction = $afterAll->filter(static fn ($row): bool => ! $row->is_preview)->values();
        $afterPreview = $afterAll->filter(static fn ($row): bool => (bool) $row->is_preview)->values();
        $after = rawRows($afterProduction);
        checked(sameRows($beforePreview, rawRows($afterPreview)));
        checked(sameRows(unrelated($before, $targetIds), unrelated($after, $targetIds)));
        checked(array_keys(canonicalRows($before)) === array_keys(canonicalRows($after)));
        $freshTargets = targets($afterProduction);
        if ($mode === 'cutover') {
            foreach ($freshTargets as $key => $row) {
                $expectedValue = $key === 'DB_PASSWORD' ? $payload['runtime_password'] : $payload['runtime_role'];
                checked(is_string($row->value) && hash_equals($expectedValue, $row->value));
                checked(databaseBoolean($row->is_runtime) && ! databaseBoolean($row->is_buildtime) &&
                        databaseBoolean($row->is_literal) && ! databaseBoolean($row->is_multiline));
                $old = canonicalRows($before)[(string) $row->getKey()];
                checked(immutableTargetAttributes($old, $row->getRawOriginal()));
                // Getter must round-trip while raw storage remains ciphertext.
                checked(is_string($row->getRawOriginal('value')) &&
                        ! hash_equals($expectedValue, $row->getRawOriginal('value')));
            }
        } else {
            checked(sameRows($after, $payload['restore_env_rows']));
            checked($freshTargets['DB_USERNAME']->value === 'postgres');
        }
        $afterFiles = rawRows($fileQuery()->lockForUpdate()->get());
        $afterVolumes = rawRows($volumeQuery()->lockForUpdate()->get());
        checked(array_keys(canonicalMountRows($beforeFiles)) === array_keys(canonicalMountRows($afterFiles)));
        checked(sameMountRows(unrelated($beforeFiles, $guardIds), unrelated($afterFiles, $guardIds)));
        checked(sameMountRows($beforeVolumes, $afterVolumes));
        $afterGuard = canonicalMountRows($afterFiles)[(string) $guard->getKey()];
        guardScope($afterGuard, $application);
        checked($afterGuard['fs_path'] === $payload['new_guard_source']);
        checked(immutableGuardAttributes($beforeGuard, $afterGuard));
        $application->refresh();
        // This refreshes only local model relations; do not mark configuration
        // applied, flush shared caches or trigger deployment from this helper.
        return ['ok' => true, 'transaction_verified' => true, 'preview_unchanged' => true,
                'unrelated_rows_unchanged' => true, 'values_verified_internally' => true,
                'guard_source_verified_internally' => true, 'unrelated_mounts_unchanged' => true,
                'changed_keys' => array_keys($selected)];
    });
    $result['transaction_completed'] = true;
    echo json_encode($result, JSON_THROW_ON_ERROR).PHP_EOL;
} catch (\Throwable $error) {
    // Includes ambiguous commit/connection failures: do not assume rollback.
    // Inspect current raw state privately before any retry or restoration.
    echo '{"ok":false,"transaction_verified":false,"transaction_completed":false}'.PHP_EOL;
    exit(1);
}

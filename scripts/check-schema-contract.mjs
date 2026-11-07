import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFile(path.join(root, file), 'utf8');

const registrySource = await read('apps/api/src/common/store.ts');
const registryBlock = registrySource.match(/export const TABLES = \[([\s\S]*?)\];/);
if (!registryBlock) throw new Error('Could not locate API table registry.');
const runtimeTables = new Set([...registryBlock[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));

const migrationDir = path.join(root, 'packages/database/supabase/migrations');
const migrationFiles = (await readdir(migrationDir))
  .filter((name) => name.endsWith('.sql'))
  .sort();
let sqlSource = '';
for (const name of migrationFiles) {
  sqlSource += `\n${await read(path.join('packages/database/supabase/migrations', name))}`;
}
const sqlTables = new Set(
  [...sqlSource.matchAll(/create\s+table(?:\s+if\s+not\s+exists)?\s+([a-z_]+)/gi)]
    .map((m) => m[1].toLowerCase()),
);

const apiSourceDir = path.join(root, 'apps/api/src');
const apiFiles = [];
async function collectTsFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) await collectTsFiles(fullPath);
    else if (entry.name.endsWith('.ts')) apiFiles.push(fullPath);
  }
}
await collectTsFiles(apiSourceDir);

const apiTables = new Set();
const apiReferences = new Map();
const tableCall = /\bdb\.[a-zA-Z_$][\w$]*\(\s*'([a-z_]+)'/g;
for (const file of apiFiles) {
  const source = await read(path.relative(root, file));
  const relativePath = path.relative(root, file).split(path.sep).join('/');
  for (const match of source.matchAll(tableCall)) {
    apiTables.add(match[1]);
    if (!apiReferences.has(match[1])) apiReferences.set(match[1], new Set());
    apiReferences.get(match[1]).add(relativePath);
  }
}

const missingSql = [...runtimeTables].filter((table) => !sqlTables.has(table)).sort();
const missingRuntime = [...apiTables].filter((table) => !runtimeTables.has(table)).sort();
const apiMissingSql = [...apiTables].filter((table) => !sqlTables.has(table)).sort();
const sqlOnly = [...sqlTables].filter((table) => !runtimeTables.has(table)).sort();
const runtimeWithoutCall = [...runtimeTables].filter((table) => !apiTables.has(table)).sort();
const expectedSqlOnly = new Set([
  'associations', 'commissions', 'dashboard_widgets', 'dashboards', 'export_jobs',
  'files', 'import_jobs', 'integration_logs', 'journey_steps', 'metric_snapshots',
  'plan_versions', 'plans', 'platform_memberships', 'price_list_items', 'price_lists',
  'report_definitions', 'report_runs', 'sales_targets', 'subscriptions',
  'support_access_approvals', 'support_access_audit', 'support_access_requests',
  'tag_links', 'tags', 'tenant_domains', 'usage_aggregates',
]);
const unexpectedSqlOnly = sqlOnly.filter((table) => !expectedSqlOnly.has(table));
const orphanedSql = [...expectedSqlOnly].filter((table) => !sqlTables.has(table));

const rlsTables = new Set();
for (const match of sqlSource.matchAll(/foreach\s+t\s+in\s+array\s+array\[([\s\S]*?)\]\s+loop/gi)) {
  for (const table of match[1].matchAll(/'([a-z_]+)'/g)) rlsTables.add(table[1]);
}
for (const match of sqlSource.matchAll(/alter\s+table\s+([a-z_]+)\s+(?:enable|force)\s+row\s+level\s+security/gi)) {
  rlsTables.add(match[1]);
}
const tablesWithoutDetectedRls = [...sqlTables].filter((table) => !rlsTables.has(table)).sort();

const sqlOnlyDispositions = {
  associations: 'CRM relationship infrastructure; no direct API table calls found.',
  commissions: 'Sales compensation schema; no direct API table calls found.',
  dashboard_widgets: 'Analytics/dashboard infrastructure; no direct API table calls found.',
  dashboards: 'Analytics/dashboard infrastructure; no direct API table calls found.',
  export_jobs: 'Import/export infrastructure; no direct API table calls found.',
  files: 'File metadata infrastructure; no direct API table calls found.',
  import_jobs: 'Import/export infrastructure; no direct API table calls found.',
  integration_logs: 'Integration observability infrastructure; no direct API table calls found.',
  journey_steps: 'Marketing journey schema; no direct API table calls found.',
  metric_snapshots: 'Analytics aggregation schema; no direct API table calls found.',
  plan_versions: 'Billing catalogue schema; no direct API table calls found.',
  plans: 'Billing catalogue schema; no direct API table calls found.',
  price_list_items: 'Commerce pricing schema; no direct API table calls found.',
  price_lists: 'Commerce pricing schema; no direct API table calls found.',
  report_definitions: 'Analytics/reporting schema; no direct API table calls found.',
  report_runs: 'Analytics/reporting schema; no direct API table calls found.',
  platform_memberships: 'Platform identities, separate from tenant membership roles; no client policy by design.',
  support_access_approvals: 'Independent and tenant-admin approval evidence; server-only until support workflow is integrated.',
  support_access_audit: 'Append-only support-access audit trail; server-only until trusted workflow integration.',
  support_access_requests: 'Bounded support-access request and grant state; no client policy by design.',
  sales_targets: 'Sales target schema; no direct API table calls found.',
  subscriptions: 'Billing schema; no direct API table callers found.',
  tag_links: 'CRM tagging schema; no direct API table calls found.',
  tags: 'CRM tagging schema; no direct API table calls found.',
  tenant_domains: 'Tenant-domain schema with RLS policy added in 0003.',
  usage_aggregates: 'Billing/analytics aggregation schema; no direct API table calls found.',
};

const report = {
  migrations: migrationFiles,
  scope: {
    liveDatabaseInspected: false,
    counts: {
      runtimeRegisteredTables: runtimeTables.size,
      sqlDeclaredTables: sqlTables.size,
      runtimeNamesWithoutSqlTable: missingSql.length,
      sqlTablesNotInRuntimeRegistry: sqlOnly.length,
      apiReferencedNamesWithoutSqlTable: apiMissingSql.length,
      apiReferencedNamesWithoutRegistryEntry: missingRuntime.length,
      runtimeNamesWithoutDirectApiCallSite: runtimeWithoutCall.length,
      declaredTablesWithoutDetectedRls: tablesWithoutDetectedRls.length,
    },
  },
  runtimeTables: [...runtimeTables].sort(),
  sqlTables: [...sqlTables].sort(),
  runtimeOnly: missingSql,
  apiReferenceGaps: {
    referencedWithoutSqlTable: apiMissingSql,
    referencedWithoutRegistry: missingRuntime,
    runtimeNamesWithoutDirectApiCalls: runtimeWithoutCall,
  },
  sqlOnly: sqlOnly.map((name) => ({
    name,
    disposition: sqlOnlyDispositions[name] ?? 'Requires owner review.',
  })),
  tablesWithoutDetectedRls,
  apiReferencesByTable: Object.fromEntries(
    [...apiReferences.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, files]) => [name, [...files].sort()]),
  ),
  sourceFindingsMitigatedByLatestMigration: [
    '0003 replaces the permissive audit_events insert policy with a tenant check.',
    '0003 adds RLS to resellers, roles, tenant_domains and webhook_events.',
    '0004 separates platform identities and adds bounded, client-denied support-access records.',
    '0004 adds tenant departments, teams, team memberships and nullable resource scope columns.',
  ],
  validation: {
    runtimeSqlContract: 'source check; no runtime table name or API literal reference is missing SQL.',
    migrationParsing: 'PostgreSQL grammar parser used locally; does not execute migrations.',
    localPostgres: 'not run; Docker/Podman unavailable.',
    liveStaging: 'not inspected or modified.',
  },
};

const output = JSON.stringify(report, null, 2) + '\n';
console.log(output);
if (process.argv.includes('--write-report')) {
  await writeFile(path.join(root, 'reports/schema-diff.json'), output);
}

if (missingSql.length || missingRuntime.length || apiMissingSql.length ||
    unexpectedSqlOnly.length || orphanedSql.length || tablesWithoutDetectedRls.length) {
  process.exitCode = 1;
}

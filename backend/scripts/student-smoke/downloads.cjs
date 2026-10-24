'use strict';

async function get(ctx, actor, route) {
  const response = await fetch(`${ctx.config.api}${route}`, { headers: { 'x-tenant-subdomain': ctx.subdomain, ...(actor?.token ? { Authorization: `Bearer ${actor.token}` } : {}) }, signal: AbortSignal.timeout(20000) });
  if (response.headers.get('x-falcon-smoke-environment') !== 'test') throw new Error('Unexpected protected-download environment.');
  return response;
}

async function verifyDownloads(ctx) {
  const docs = (await ctx.db.query("SELECT title,file_url FROM student_documents WHERE tenant_id=$1 AND student_user_id=$2 AND category='FEE_RECEIPTS' UNION ALL SELECT title,file_url FROM university_policies WHERE tenant_id=$1 AND status='ACTIVE'", [ctx.ids.tenantId, ctx.ids.studentId])).rows;
  for (const doc of docs) {
    const route = `/api/uploads/download?path=${encodeURIComponent(doc.file_url)}`;
    const response = await get(ctx, ctx.actors.student, route);
    const buffer = Buffer.from(await response.arrayBuffer());
    ctx.check(`Actual protected PDF download: ${doc.title}`, response.ok && buffer.subarray(0, 5).toString() === '%PDF-', { status: response.status, bytes: buffer.length });
  }
  for (const materialId of ctx.ids.portal.materials) {
    const route = `/api/academics/student/courses/materials/${materialId}/download`;
    const own = await get(ctx, ctx.actors.student, route);
    const buffer = Buffer.from(await own.arrayBuffer());
    ctx.check('Real published course material PDF download', own.ok && buffer.subarray(0, 5).toString() === '%PDF-', { materialId, status: own.status });
    const other = await get(ctx, ctx.actors.control, route);
    ctx.check('Other Student denied published course material without enrollment', [403, 404].includes(other.status), { materialId, status: other.status });
  }
}

module.exports = { verifyDownloads };

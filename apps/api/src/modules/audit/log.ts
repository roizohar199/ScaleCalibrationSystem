import { prisma } from "../../db/prisma.js";

export async function auditLog(params: {
  entity: string;
  entityId: string;
  field?: string;
  oldValue?: string | null;
  newValue?: string | null;
  changedById?: string | null;
  reason?: string | null;
}) {
  await prisma.auditLog.create({
    data: {
      entity: params.entity,
      entityId: params.entityId,
      field: params.field,
      oldValue: params.oldValue ?? null,
      newValue: params.newValue ?? null,
      changedById: params.changedById ?? null,
      reason: params.reason ?? null
    }
  });
}


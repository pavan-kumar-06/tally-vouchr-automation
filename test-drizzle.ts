import { db } from "./apps/web/lib/db";
import { statement } from "@vouchr/db";

async function main() {
  const stmts = await db.query.statement.findMany({ limit: 1 });
  console.log("findMany RESULT: ", stmts);
}

main().catch(console.error);

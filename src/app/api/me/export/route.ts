import { NextResponse } from "next/server";
import { requireApi } from "@/lib/auth/guards";
import { exportStudentData } from "@/lib/services/studentData";

export async function GET() {
  const auth = await requireApi(["student"]);
  if (auth.error) return auth.error;
  const data = await exportStudentData(auth.session.sub);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'attachment; filename="aatman-data.json"',
    },
  });
}

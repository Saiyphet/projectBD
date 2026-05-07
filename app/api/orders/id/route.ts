import { NextRequest, NextResponse } from "next/server";
import {createClient} from "../../../../lib/supabase/server";


type Params = { params: { id: string } };

// ─── GET /api/orders/[id] ──────────────────────────────────────────────────
// Public: ค้นหาด้วย GFW-001 (order_number)
// Admin: ค้นหาด้วย uuid ก็ได้

export async function GET(_req: NextRequest, { params }: Params) {
    try {
        const supabase = await createClient();
        const { id } = params;

        // GFW-001 = order_number | uuid = id
        const isOrderNumber = id.startsWith("GFW-");

        const { data, error } = await supabase
            .from("orders")
            .select(`
        *,
        order_logs (
          id, from_status, to_status, note, changed_by, created_at
        )
      `)
            .eq(isOrderNumber ? "order_number" : "id", id)
            .single();

        if (error) return NextResponse.json({ error: "Order not found" }, { status: 404 });

        return NextResponse.json({ data });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// ─── PATCH /api/orders/[id] — Admin only ──────────────────────────────────
// แก้ได้: admin_note, tracking_number

export async function PATCH(req: NextRequest, { params }: Params) {
    try {
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await req.json();

        // อนุญาตแค่ field เหล่านี้
        const allowed = ["admin_note", "tracking_number"];
        const update: Record<string, any> = {};
        for (const key of allowed) {
            if (key in body) update[key] = body[key];
        }

        if (!Object.keys(update).length) {
            return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
        }

        const { data, error } = await supabase
            .from("orders")
            .update(update)
            .eq("id", params.id)
            .select()
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 400 });

        return NextResponse.json({ data });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
import { NextRequest, NextResponse } from "next/server";
import {createClient} from "../../../../lib/supabase/server";


type Params = { params: { id: string } };

// ─── GET /api/products/[id] — Public ──────────────────────────────────────
// รองรับทั้ง uuid และ slug

export async function GET(_req: NextRequest, { params }: Params) {
    try {
        const supabase = await createClient();
        const { id } = params;

        const isUuid = id.length === 36 && id.includes("-");

        let query = supabase.from("products").select(`
      *,
      reviews (
        id, reviewer_name, rating, comment, created_at
      )
    `);

        query = isUuid ? query.eq("id", id) : query.eq("slug", id);

        const { data, error } = await query.single();
        if (error) return NextResponse.json({ error: "Product not found" }, { status: 404 });

        return NextResponse.json({ data });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// ─── PATCH /api/products/[id] — Admin only ────────────────────────────────

export async function PATCH(req: NextRequest, { params }: Params) {
    try {
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await req.json();

        // Re-generate slug ถ้าเปลี่ยนชื่อ
        if (body.name) {
            body.slug = body.name.toLowerCase().trim()
                .replace(/\s+/g, "-")
                .replace(/[^a-z0-9-]/g, "");
        }

        const { data, error } = await supabase
            .from("products")
            .update(body)
            .eq("id", params.id)
            .select()
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 400 });

        return NextResponse.json({ data });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// ─── DELETE /api/products/[id] — Admin only (soft delete) ─────────────────

export async function DELETE(_req: NextRequest, { params }: Params) {
    try {
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        // Soft delete — set active=false แทนการลบจริง
        const { error } = await supabase
            .from("products")
            .update({ active: false })
            .eq("id", params.id);

        if (error) return NextResponse.json({ error: error.message }, { status: 400 });

        return NextResponse.json({ data: { message: "Product deactivated" } });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
import { NextRequest, NextResponse } from "next/server";
import {createClient} from "../../../../../lib/supabase/server";


// ─── PATCH /api/products/[id]/stock — Admin only ──────────────────────────
// body: { stock: number, reason: string }

export async function PATCH(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { stock, reason } = await req.json();

        if (stock === undefined || stock === null) {
            return NextResponse.json({ error: "stock is required" }, { status: 400 });
        }
        if (stock < 0) {
            return NextResponse.json({ error: "stock cannot be negative" }, { status: 400 });
        }

        // Get current stock for log
        const { data: product } = await supabase
            .from("products")
            .select("stock, name")
            .eq("id", params.id)
            .single();

        if (!product) {
            return NextResponse.json({ error: "Product not found" }, { status: 404 });
        }

        // Update stock
        const { error } = await supabase
            .from("products")
            .update({ stock })
            .eq("id", params.id);

        if (error) return NextResponse.json({ error: error.message }, { status: 400 });

        // Log stock change
        await supabase.from("stock_logs").insert({
            product_id: params.id,
            old_stock: product.stock,
            new_stock: stock,
            reason: reason ?? "Manual update",
            changed_by: "admin",
        });

        return NextResponse.json({
            data: {
                product_id: params.id,
                old_stock: product.stock,
                new_stock: stock,
                reason: reason ?? "Manual update",
            },
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
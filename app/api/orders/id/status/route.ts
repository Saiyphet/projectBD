import { NextRequest, NextResponse } from "next/server";
import {createClient} from "../../../../../lib/supabase/server";


const VALID_STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled"];

// ─── PATCH /api/orders/[id]/status — Admin only ───────────────────────────
// body: { status?, payment_status?, note? }

export async function PATCH(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { status, payment_status, note } = await req.json();

        if (!status && !payment_status) {
            return NextResponse.json(
                { error: "status or payment_status is required" },
                { status: 400 }
            );
        }

        if (status && !VALID_STATUSES.includes(status)) {
            return NextResponse.json(
                { error: `status must be: ${VALID_STATUSES.join(", ")}` },
                { status: 400 }
            );
        }

        // Get current status for log
        const { data: current } = await supabase
            .from("orders")
            .select("status, items")
            .eq("id", params.id)
            .single();

        if (!current) return NextResponse.json({ error: "Order not found" }, { status: 404 });

        // Update order
        const update: Record<string, any> = {};
        if (status) update.status = status;
        if (payment_status) update.payment_status = payment_status;

        const { error } = await supabase
            .from("orders")
            .update(update)
            .eq("id", params.id);

        if (error) return NextResponse.json({ error: error.message }, { status: 400 });

        // Log status change
        if (status && status !== current.status) {
            await supabase.from("order_logs").insert({
                order_id: params.id,
                from_status: current.status,
                to_status: status,
                changed_by: "admin",
                note: note ?? null,
            });
        }

        // ถ้า cancel → คืน stock
        if (status === "cancelled") {
            for (const item of current.items ?? []) {
                const { data: product } = await supabase
                    .from("products")
                    .select("stock")
                    .eq("id", item.product_id)
                    .single();

                if (product) {
                    const newStock = product.stock + item.quantity;
                    await supabase.from("products").update({ stock: newStock }).eq("id", item.product_id);
                    await supabase.from("stock_logs").insert({
                        product_id: item.product_id,
                        old_stock: product.stock,
                        new_stock: newStock,
                        reason: "Order cancelled — stock restored",
                        changed_by: "admin",
                    });
                }
            }
        }

        return NextResponse.json({
            data: { message: "Updated", status, payment_status },
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
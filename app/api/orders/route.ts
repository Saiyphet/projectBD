import { NextRequest, NextResponse } from "next/server";
import {createClient} from "../../../lib/supabase/server";

// ─── GET /api/orders — Admin only ─────────────────────────────────────────
// Query: status, payment_status, search, page, limit

export async function GET(req: NextRequest) {
    try {
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const url = new URL(req.url);
        const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
        const limit = Math.min(100, parseInt(url.searchParams.get("limit") ?? "20"));
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        let query = supabase
            .from("orders")
            .select("*", { count: "exact" })
            .order("created_at", { ascending: false })
            .range(from, to);

        const status = url.searchParams.get("status");
        if (status) query = query.eq("status", status);

        const paymentStatus = url.searchParams.get("payment_status");
        if (paymentStatus) query = query.eq("payment_status", paymentStatus);

        const search = url.searchParams.get("search");
        if (search) {
            query = query.or(
                `order_number.ilike.%${search}%,customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%`
            );
        }

        const { data, error, count } = await query;
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });

        return NextResponse.json({
            data,
            meta: { total: count ?? 0, page, limit },
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// ─── POST /api/orders — Public (ลูกค้าสั่งซื้อ) ───────────────────────────

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const body = await req.json();

        const {
            items, subtotal, shipping_cost, discount_amount, total,
            customer_name, customer_phone, customer_email,
            customer_address, customer_city, note, discount_code,
        } = body;

        // Validate
        if (!items?.length)       return NextResponse.json({ error: "items are required" }, { status: 400 });
        if (!customer_name)       return NextResponse.json({ error: "customer_name is required" }, { status: 400 });
        if (!customer_phone)      return NextResponse.json({ error: "customer_phone is required" }, { status: 400 });
        if (!customer_address)    return NextResponse.json({ error: "customer_address is required" }, { status: 400 });
        if (!customer_city)       return NextResponse.json({ error: "customer_city is required" }, { status: 400 });
        if (!total)               return NextResponse.json({ error: "total is required" }, { status: 400 });

        // Generate order number GFW-001
        const { count } = await supabase
            .from("orders")
            .select("*", { count: "exact", head: true });

        const order_number = `GFW-${String((count ?? 0) + 1).padStart(3, "0")}`;

        // Insert order
        const { data: order, error } = await supabase
            .from("orders")
            .insert({
                order_number,
                items,
                subtotal,
                shipping_cost: shipping_cost ?? 30000,
                discount_amount: discount_amount ?? 0,
                total,
                customer_name,
                customer_phone,
                customer_email: customer_email ?? null,
                customer_address,
                customer_city,
                note: note ?? null,
                status: "pending",
                payment_status: "unpaid",
            })
            .select()
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 400 });

        // ลด stock แต่ละ item
        for (const item of items) {
            const { data: product } = await supabase
                .from("products")
                .select("stock")
                .eq("id", item.product_id)
                .single();

            if (product) {
                const newStock = Math.max(0, product.stock - item.quantity);
                await supabase.from("products").update({ stock: newStock }).eq("id", item.product_id);
                await supabase.from("stock_logs").insert({
                    product_id: item.product_id,
                    old_stock: product.stock,
                    new_stock: newStock,
                    reason: `Order ${order_number}`,
                    changed_by: "customer",
                });
            }
        }

        return NextResponse.json({
            data: { order_number, id: order.id },
        }, { status: 201 });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
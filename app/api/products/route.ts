import { NextRequest, NextResponse } from "next/server";
import {createClient} from "../../../lib/supabase/server";


// ─── GET /api/products ─────────────────────────────────────────────────────
// Public: active=true only
// Admin (with token): all products
// Query: category, brand, badge, search, min_price, max_price, page, limit

export async function GET(req: NextRequest) {
    try {
        const supabase = await createClient();
        const url = new URL(req.url);

        const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
        const limit = Math.min(100, parseInt(url.searchParams.get("limit") ?? "20"));
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        const { data: { user } } = await supabase.auth.getUser();

        let query = supabase
            .from("products")
            .select("*", { count: "exact" })
            .order("created_at", { ascending: false })
            .range(from, to);

        // Public เห็นแค่ active
        if (!user) query = query.eq("active", true);

        const category = url.searchParams.get("category");
        if (category) query = query.eq("category", category);

        const brand = url.searchParams.get("brand");
        if (brand) query = query.eq("brand", brand);

        const badge = url.searchParams.get("badge");
        if (badge) query = query.eq("badge", badge);

        const search = url.searchParams.get("search");
        if (search) query = query.ilike("name", `%${search}%`);

        const minPrice = url.searchParams.get("min_price");
        if (minPrice) query = query.gte("price", parseInt(minPrice));

        const maxPrice = url.searchParams.get("max_price");
        if (maxPrice) query = query.lte("price", parseInt(maxPrice));

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

// ─── POST /api/products — Admin only ──────────────────────────────────────

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();

        // Auth check
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await req.json();
        const { name, price } = body;

        if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
        if (!price) return NextResponse.json({ error: "price is required" }, { status: 400 });

        // Auto-generate slug
        const slug = name.toLowerCase().trim()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9-]/g, "");

        const { data, error } = await supabase
            .from("products")
            .insert({ ...body, slug })
            .select()
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 400 });

        return NextResponse.json({ data }, { status: 201 });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
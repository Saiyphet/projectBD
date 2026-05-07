import { NextRequest, NextResponse } from "next/server";
import {createClient} from "../../../../../lib/supabase/server";


// ─── POST /api/orders/[id]/slip — Public (ลูกค้า upload สลิป) ─────────────
// FormData: slip (File)

export async function POST(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const supabase = await createClient();
        const formData = await req.formData();
        const file = formData.get("slip") as File | null;

        if (!file) return NextResponse.json({ error: "slip file is required" }, { status: 400 });
        if (!file.type.startsWith("image/")) {
            return NextResponse.json({ error: "File must be an image" }, { status: 400 });
        }
        if (file.size > 5 * 1024 * 1024) {
            return NextResponse.json({ error: "File size must be under 5MB" }, { status: 400 });
        }

        // Check order exists
        const { data: order } = await supabase
            .from("orders")
            .select("id, order_number")
            .eq("id", params.id)
            .single();

        if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

        // Upload to slips bucket
        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `${params.id}/${Date.now()}.${ext}`;

        const { error: uploadError } = await supabase.storage
            .from("slips")
            .upload(path, file, { upsert: true });

        if (uploadError) {
            return NextResponse.json({ error: uploadError.message }, { status: 400 });
        }

        // slips = private bucket → ใช้ signed URL
        const { data: signedData } = await supabase.storage
            .from("slips")
            .createSignedUrl(path, 60 * 60 * 24 * 7); // 7 วัน

        const slip_image = path; // เก็บ path ไว้ใน DB

        // Update order
        const { error } = await supabase
            .from("orders")
            .update({ slip_image })
            .eq("id", params.id);

        if (error) return NextResponse.json({ error: error.message }, { status: 400 });

        return NextResponse.json({
            data: {
                slip_image,
                signed_url: signedData?.signedUrl,
                message: "Slip uploaded successfully",
            },
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
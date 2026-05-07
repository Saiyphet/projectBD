import { NextRequest, NextResponse } from "next/server";
import {createClient} from "../../../lib/supabase/server";


const ALLOWED_BUCKETS = ["products", "banners", "drops", "posts", "parks", "slips"];
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

// ─── POST /api/upload ──────────────────────────────────────────────────────
// FormData: file (File), bucket (string), folder? (string)
// slips → Public upload (ลูกค้า upload สลิป)
// ที่เหลือ → Admin only

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const formData = await req.formData();

        const file = formData.get("file") as File | null;
        const bucket = formData.get("bucket") as string | null;
        const folder = (formData.get("folder") as string | null) ?? undefined;

        // Validate inputs
        if (!file) return NextResponse.json({ error: "file is required" }, { status: 400 });
        if (!bucket) return NextResponse.json({ error: "bucket is required" }, { status: 400 });
        if (!ALLOWED_BUCKETS.includes(bucket)) {
            return NextResponse.json(
                { error: `bucket must be one of: ${ALLOWED_BUCKETS.join(", ")}` },
                { status: 400 }
            );
        }

        // slips = public upload (ลูกค้าอัป) | ที่เหลือ = admin เท่านั้น
        if (bucket !== "slips") {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Validate file type
        if (!ALLOWED_TYPES.includes(file.type)) {
            return NextResponse.json(
                { error: "File must be JPEG, PNG, WebP, or GIF" },
                { status: 400 }
            );
        }

        // Validate file size
        if (file.size > MAX_SIZE) {
            return NextResponse.json(
                { error: "File size must be under 10MB" },
                { status: 400 }
            );
        }

        // Generate unique filename
        const ext = file.name.split(".").pop() ?? "jpg";
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).slice(2, 8);
        const filename = `${timestamp}_${randomId}.${ext}`;
        const path = folder ? `${folder}/${filename}` : filename;

        // Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
            .from(bucket)
            .upload(path, file, { upsert: false });

        if (uploadError) {
            return NextResponse.json({ error: uploadError.message }, { status: 400 });
        }

        // Get public URL
        const { data } = supabase.storage.from(bucket).getPublicUrl(path);

        return NextResponse.json({
            data: {
                url: data.publicUrl,
                path,
                bucket,
            },
        }, { status: 201 });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
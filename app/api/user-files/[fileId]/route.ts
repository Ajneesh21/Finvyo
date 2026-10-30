import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { getUserFile, deleteUserFile } from "@/lib/user-storage";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ fileId: string }> }
) {
  try {
    const user = await getAuthUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { fileId } = await context.params;
    if (!fileId) {
      return NextResponse.json({ error: "File ID required" }, { status: 400 });
    }

    const ip = getClientIp(req);
    const rateCheck = await checkRateLimit(`user-files:download:${ip}`, {
      maxRequests: 60,
      windowSeconds: 60,
    });
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait.", retryAfter: rateCheck.resetInSeconds },
        { status: 429, headers: { "Retry-After": String(rateCheck.resetInSeconds) } }
      );
    }

    // Retrieve file strictly checking user ownership and sandboxed path
    const fileResult = await getUserFile(
      user.userId,
      user.storageFolderKey,
      fileId
    );

    if (!fileResult) {
      return NextResponse.json(
        { error: "File not found or access denied" },
        { status: 404 }
      );
    }

    const { metadata, buffer } = fileResult;

    const safeFilename = metadata.originalFilename.replace(/["\r\n]/g, "_");

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": metadata.fileType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${safeFilename}"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  } catch (err: any) {
    console.error("[UserFiles API] Error downloading file:", err);
    return NextResponse.json(
      { error: "Failed to download file" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ fileId: string }> }
) {
  try {
    const user = await getAuthUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { fileId } = await context.params;
    if (!fileId) {
      return NextResponse.json({ error: "File ID required" }, { status: 400 });
    }

    const deleted = await deleteUserFile(
      user.userId,
      user.storageFolderKey,
      fileId
    );

    if (!deleted) {
      return NextResponse.json(
        { error: "File not found or access denied" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, fileId });
  } catch (err: any) {
    console.error("[UserFiles API] Error deleting file:", err);
    return NextResponse.json(
      { error: "Failed to delete file" },
      { status: 500 }
    );
  }
}

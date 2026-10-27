import { auth } from "@/lib/auth/server";

type Handlers = ReturnType<typeof auth.handler>;
let handlers: Handlers | undefined;
const get = () => (handlers ??= auth.handler());

export const GET: Handlers["GET"] = (request, ctx) => get().GET(request, ctx);
export const POST: Handlers["POST"] = (request, ctx) => get().POST(request, ctx);

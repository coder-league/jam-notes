import { handle, json } from '@/lib/auth';
import { likeLists } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = handle(async () => json(await likeLists()));

import Link from "next/link";
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 text-center">
      <div><div className="font-bold mb-1">That page isn&rsquo;t here.</div><Link href="/" className="text-sm text-teal-ink">Back to the caseload</Link></div>
    </div>
  );
}

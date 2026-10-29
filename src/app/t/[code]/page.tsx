import { TableApp } from "@/components/TableApp";

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <TableApp code={code.toUpperCase()} />;
}

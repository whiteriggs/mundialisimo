import { flagUrl } from "@/lib/flags";

export default function Flag({ name }: { name: string }) {
  const url = flagUrl(name);
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={name} width={20} height={15} style={{ display: "inline-block", verticalAlign: "middle", marginRight: 5, flexShrink: 0 }} />;
}

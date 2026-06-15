/**
 * Faz download de um arquivo via fetch → Blob → URL.createObjectURL.
 * Evita ERR_BLOCKED_BY_CLIENT (adblock/Shields bloqueando URLs que contêm
 * "anexos" + domínio do backend), pois a URL final entregue ao browser
 * é um blob: que a extensão não consegue inspecionar.
 */
export async function downloadViaBlob(url: string, fileName: string): Promise<void> {
  const res = await fetch(url, { credentials: "omit" });
  if (!res.ok) throw new Error(`Falha ao baixar arquivo (${res.status})`);
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = fileName || "arquivo";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  }
}

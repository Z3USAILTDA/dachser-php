/**
 * Copia texto para a área de transferência com fallback para ambientes iframe/preview.
 * Retorna true se copiou com sucesso, false caso contrário.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // Tenta a API moderna primeiro
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Falhou (iframe/permissões) — tenta fallback
    }
  }

  // Fallback com execCommand
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Extrai texto de HTML e copia para a área de transferência.
 */
export async function copyHtmlAsText(html: string): Promise<boolean> {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  const text = (tempDiv.textContent || tempDiv.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
  return copyToClipboard(text);
}

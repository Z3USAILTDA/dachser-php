/**
 * Copia texto para a área de transferência com fallback para ambientes iframe/preview e dialogs.
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

  // Fallback com ClipboardItem
  if (navigator.clipboard && typeof ClipboardItem !== "undefined") {
    try {
      const blob = new Blob([text], { type: "text/plain" });
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
      return true;
    } catch {
      // Continue to next fallback
    }
  }

  // Fallback legado com execCommand — robusto para dialogs e focus traps
  try {
    const previousActiveElement = document.activeElement as HTMLElement | null;

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';

    // Inserir dentro do dialog ativo (se houver) para manter o foco dentro do focus trap
    const container = document.activeElement?.closest('[role="dialog"]') || document.body;
    container.appendChild(textarea);

    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    const ok = document.execCommand('copy');

    container.removeChild(textarea);

    // Restaurar foco anterior
    if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
      previousActiveElement.focus();
    }

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

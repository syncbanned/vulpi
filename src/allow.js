// Só o YouTube Music e os domínios de login do Google ficam dentro do app.
// Inclui google.com.br etc., porque o login pode redirecionar para o domínio do país.
function isAllowed(url) {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'https:') return false;
    return (
      hostname === 'music.youtube.com' ||
      hostname === 'www.youtube.com' ||       // redireciona no login/logout
      hostname === 'accounts.youtube.com' ||
      hostname === 'consent.youtube.com' ||
      /^accounts\.google\.com(\.[a-z]{2})?$/.test(hostname) ||
      /^(www\.)?google\.com(\.[a-z]{2})?$/.test(hostname)
    );
  } catch {
    return false;
  }
}

module.exports = { isAllowed };

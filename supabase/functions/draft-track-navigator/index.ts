const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { navigatorUrl } = await req.json();

    if (!navigatorUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'Navigator URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl connector not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Attempting to scrape Navigator URL:', navigatorUrl);

    // Try scraping with extended wait time for SPA
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: navigatorUrl,
        formats: ['markdown', 'html', 'screenshot'],
        onlyMainContent: false, // Get full page to see login forms etc
        waitFor: 15000, // Wait 15 seconds for SPA to load
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Firecrawl API error:', data);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: data.error || `Request failed with status ${response.status}`,
          rawResponse: data
        }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Firecrawl response received');
    console.log('Markdown length:', data.data?.markdown?.length || 0);
    console.log('HTML length:', data.data?.html?.length || 0);
    console.log('Has screenshot:', !!data.data?.screenshot);

    // Check if we got a login page
    const markdown = data.data?.markdown || '';
    const html = data.data?.html || '';
    const url = data.data?.metadata?.url || '';
    
    const isLoginPage = 
      markdown.toLowerCase().includes('please log in') ||
      markdown.toLowerCase().includes('sign in') ||
      markdown.toLowerCase().includes('anmelden') ||
      markdown.toLowerCase().includes('e-mail address') ||
      markdown.toLowerCase().includes('password') ||
      url.includes('identity.hapag-lloyd.com') ||
      url.includes('oauth2') ||
      url.includes('signin') ||
      html.toLowerCase().includes('login-form') ||
      html.toLowerCase().includes('authentication');

    const hasContainerData = 
      markdown.includes('Container') ||
      markdown.includes('HLCU') ||
      markdown.includes('TCLU') ||
      markdown.includes('TRHU');

    return new Response(
      JSON.stringify({
        success: true,
        analysis: {
          isLoginPage,
          hasContainerData,
          markdownLength: markdown.length,
          htmlLength: html.length,
          hasScreenshot: !!data.data?.screenshot,
        },
        markdown: markdown.substring(0, 5000), // First 5000 chars for analysis
        screenshot: data.data?.screenshot || null,
        metadata: data.data?.metadata || null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error scraping Navigator:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to scrape Navigator';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

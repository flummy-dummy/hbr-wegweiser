<script lang="ts">
  type LoginFormState = {
    success?: boolean;
    message?: string;
    values?: Record<string, FormDataEntryValue>;
  };

  let { data, form }: { data: { redirectTo: string }; form?: LoginFormState } = $props();

  function stringValue(key: string): string {
    const value = form?.values?.[key];
    return typeof value === 'string' ? value : '';
  }
</script>

<main class="page auth-page">
  <section class="panel auth-panel">
    <h1>Login</h1>
    <p>Melde dich mit deinem PocketBase-Konto an, um auf Karte und Bearbeitung zuzugreifen.</p>

    {#if form?.message}
      <p class:success-message={form.success} class:error-message={!form.success} class="form-message">
        {form.message}
      </p>
    {/if}

    <form method="POST" class="admin-form">
      <input type="hidden" name="redirectTo" value={data.redirectTo} />

      <label class="field">
        <span>E-Mail</span>
        <input
          name="email"
          type="email"
          autocomplete="email"
          required
          value={stringValue('email')}
        />
      </label>

      <label class="field">
        <span>Passwort</span>
        <input
          name="password"
          type="password"
          autocomplete="current-password"
          required
        />
      </label>

      <button class="button button-large" type="submit">Einloggen</button>
    </form>
  </section>
</main>

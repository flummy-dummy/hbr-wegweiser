<script lang="ts">
  import { page } from '$app/state';
</script>

<main class="page">
  <section class="panel">
    <h1>Fehler {page.status}</h1>
    <p class="form-message error-message">{page.error?.message ?? 'Ein unerwarteter Fehler ist aufgetreten.'}</p>
    <a class="button secondary-button" href="/">Zur Startseite</a>
  </section>
</main>

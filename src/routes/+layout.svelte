<script lang="ts">
  import '../styles.css';

  let { children, data } = $props();

  function authState() {
    return data?.auth ?? {
      isAuthenticated: false,
      user: null,
      role: null,
      canRead: false,
      canEdit: false,
      canDelete: false,
      canManageAdmin: false
    };
  }
</script>

<div class="app-shell">
  <header class="app-header">
    <a href="/">HBR-Wegweiser</a>

    <nav class="app-header-nav">
      {#if authState().isAuthenticated}
        <span class="app-user-badge">
          {authState().user?.name} · {authState().role ?? 'ohne Rolle'}
        </span>
        <a href="/kataster/karte">Kataster</a>
        {#if authState().canEdit}
          <a href="/admin/themenrouten">Admin</a>
        {/if}
        <form method="POST" action="/logout">
          <button class="button secondary-button" type="submit">Logout</button>
        </form>
      {:else}
        <a href="/login">Login</a>
      {/if}
    </nav>
  </header>

  <div class="app-content">
{@render children()}
  </div>
</div>

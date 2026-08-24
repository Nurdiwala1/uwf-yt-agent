export default function SettingsPage() {
  return (
    <main>
      <aside>
        <div className="brand"><span>UWF</span> YT Agent</div>
        <nav>
          <a href="/">Overview</a>
          <a href="/">Content pipeline</a>
          <a href="/">Schedule</a>
          <a href="/">Video library</a>
          <a className="active" href="/settings">Settings</a>
        </nav>
        <div className="sidebar-foot">Operations console<br/><small>v1.0.0</small></div>
      </aside>
      <section className="content settings-page">
        <header>
          <div>
            <p className="eyebrow">UWF YT AGENT</p>
            <h1>Settings</h1>
            <p className="muted">Manage your channel connection and agent resources.</p>
          </div>
          <a className="button" href="/">← Dashboard</a>
        </header>

        <div className="settings-grid">
          <section className="panel">
            <p className="eyebrow">YOUTUBE CHANNEL</p>
            <h2>Channel connection</h2>
            <p className="settings-copy">Connect a different YouTube channel whenever you need. Re-authorizing will replace the currently connected Google account for this agent.</p>
            <div className="settings-actions">
              <a className="button" href="/api/youtube/oauth">Connect / Change Channel</a>
              <a className="text-link" href="https://studio.youtube.com" target="_blank" rel="noreferrer">Open YouTube Studio →</a>
            </div>
          </section>

          <section className="panel">
            <p className="eyebrow">GUIDE</p>
            <h2>How the agent works</h2>
            <ol className="guide-list">
              <li>Research the daily topic.</li>
              <li>Generate the script and metadata.</li>
              <li>Create voice and video assets.</li>
              <li>Run SEO and prepare the upload.</li>
              <li>Upload and publish to the connected channel.</li>
            </ol>
          </section>

          <section className="panel">
            <p className="eyebrow">PRIVACY</p>
            <h2>Privacy Policy</h2>
            <p className="settings-copy">Your YouTube authorization is used by the agent to access the channel features required for uploading and analytics. Keep your OAuth and server credentials private.</p>
            <a className="text-link" href="#privacy-details">View privacy details →</a>
          </section>

          <section className="panel" id="privacy-details">
            <p className="eyebrow">PRIVACY DETAILS</p>
            <h2>Data & access</h2>
            <ul className="guide-list">
              <li>Channel authorization is handled through Google OAuth.</li>
              <li>API secrets stay in the server environment, not the dashboard UI.</li>
              <li>Changing the channel starts a new Google authorization flow.</li>
            </ul>
          </section>
        </div>
      </section>
    </main>
  );
}

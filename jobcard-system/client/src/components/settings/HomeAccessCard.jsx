// Home access: the app is reachable from outside the office through a
// Cloudflare Tunnel running on this computer (see HOME-ACCESS.md). This card
// shows the address staff type from home, and lets an admin set the home
// access code every home sign-in must give on top of a PIN.
export default function HomeAccessCard({ s }) {
  const codeSet = s.settings?.homeAccessCodeSet;
  const savedAddress = s.settings?.homeAddress;
  const hintStyle = { marginTop: '.3rem', fontSize: '.85rem', opacity: 0.7 };

  return (
    <div className="card full-width">
      <div className="card-header">
        <h2>Home Access</h2>
      </div>
      <div className="card-body">
        <dl className="info-list">
          <div className="info-item">
            <dt>Home address</dt>
            <dd>
              {savedAddress ? (
                <>
                  <div style={{ marginTop: '.4rem' }}><strong>{savedAddress}</strong></div>
                  <div style={hintStyle}>Anyone working from home opens this in a web browser, then signs in with the home access code and their PIN.</div>
                </>
              ) : (
                <>
                  Not set.
                  <div style={hintStyle}>Type the address here once home access is set up, so staff can find it. Ask whoever installed the system if you're not sure.</div>
                </>
              )}
            </dd>
          </div>
          <div className="info-item">
            <dt>Home access code</dt>
            <dd>
              {codeSet
                ? 'A code is set. Anyone signing in from home types it as well as their PIN.'
                : 'No code set, so nobody can sign in from home yet.'}
            </dd>
          </div>
        </dl>

        {s.isAdmin && (
          <>
            <div className="timeout-input-group" style={{ marginTop: '.75rem' }}>
              <input
                type="text"
                className="form-control"
                style={{ maxWidth: '360px' }}
                value={s.homeAddress}
                onChange={(e) => s.setHomeAddress(e.target.value)}
                placeholder="e.g. https://jobs.93120050.online"
                autoComplete="off"
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={s.handleSaveHomeAddress}
                disabled={s.savingHomeAddress}
              >
                {s.savingHomeAddress ? 'Saving...' : 'Save address'}
              </button>
            </div>

            <div className="timeout-input-group" style={{ marginTop: '.75rem' }}>
              <input
                type="password"
                className="form-control"
                style={{ maxWidth: '360px' }}
                value={s.homeAccessCode}
                onChange={(e) => s.setHomeAccessCode(e.target.value)}
                placeholder={codeSet ? 'New code (8+ characters)' : 'Choose a code (8+ characters)'}
                autoComplete="off"
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={s.handleSaveHomeAccessCode}
                disabled={
                  s.savingHomeAccess ||
                  (s.homeAccessCode.length > 0 && s.homeAccessCode.length < 8) ||
                  (!s.homeAccessCode && !codeSet)
                }
              >
                {s.savingHomeAccess ? 'Saving...' : s.homeAccessCode ? 'Save code' : 'Switch off'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

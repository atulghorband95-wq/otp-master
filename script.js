 const API_BASE_URL = "https://otp-master-backend.onrender.com";

const pageData = {
  dashboard: ["Dashboard", "Your account overview"],
  numbers: ["Buy Numbers", "Explore virtual number services"],
  emails: ["Buy Emails", "Explore email services"],
  wallet: ["Wallet & Recharge", "Manage your wallet balance"],
  history: ["Numbers History", "View your number orders"],
  mailhistory: ["Mail History", "View your email orders"],
  updates: ["Latest Updates", "Platform announcements"],
  support: ["Support", "Get help with your account"],
  profile: ["My Profile", "Personal information"],
  settings: ["Settings", "Account preferences"],
  admin: ["Admin Panel", "Approve or reject UTR recharges"]
};

const appState = {
  token: localStorage.getItem("otpm_token") || "",
  user: null,
  wallet: { balance: 0, currency: "INR" },
  transactions: [],
  services: { numbers: [], emails: [] },
  orders: [],
  updates: [],
  tickets: [],
  selectedNumberId: null,
  selectedEmailId: null,
  authMode: "login",
  lastLoginEmail: ""
};

let activeNumberPollTimer = null;

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function copyText(text, label) {
  if (!text) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(String(text)).catch(() => {});
  }
  alert((label || "Copied") + ": " + text);
}

function updateHeaderUI() {
  const isLoggedIn = Boolean(appState.token);
  const sidebar = document.getElementById("sidebar");
  const topbar = document.querySelector(".topbar, header");

  if (sidebar) sidebar.style.display = isLoggedIn ? "" : "none";
  if (topbar) topbar.style.display = isLoggedIn ? "" : "none";

  const balEl = document.getElementById("header-balance");
  if (balEl) balEl.textContent = Number(appState.wallet?.balance || 0).toFixed(2);
  const avEl = document.getElementById("header-avatar");
  const name = (appState.user?.full_name || appState.user?.email || "U").trim();
  if (avEl && name) avEl.textContent = name.charAt(0).toUpperCase();
  const navAdmin = document.getElementById("nav-admin");
  if (navAdmin) {
    const role = (appState.user?.role || "").toLowerCase();
    navAdmin.style.display = isLoggedIn && role === "admin" ? "flex" : "none";
  }
  document.querySelectorAll('.nav-link[data-page="sms"]').forEach(el => {
    el.style.display = "none";
  });
}

async function apiRequest(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (appState.token) headers.Authorization = `Bearer ${appState.token}`;
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) {
        if (response.status === 401 && appState.token) logoutUser(false);
        throw new Error(data.message || "Request failed");
      }
      return data;
    } catch (err) {
      lastErr = err;
      if (attempt === 1 && /failed to fetch/i.test(err.message || "")) {
        await new Promise(r => setTimeout(r, 3500));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

async function syncAccountData() {
  try {
    const updRes = await apiRequest("/api/updates");
    appState.updates = updRes.updates || [];
  } catch (e) {
    appState.updates = [];
  }
  if (!appState.token) {
    updateHeaderUI();
    return;
  }
  try {
    const [dashRes, svcRes, walletRes, ordRes, supRes] = await Promise.all([
      apiRequest("/api/dashboard"),
      apiRequest("/api/services"),
      apiRequest("/api/wallet"),
      apiRequest("/api/orders"),
      apiRequest("/api/support")
    ]);
    appState.user = dashRes.profile || appState.user;
    appState.wallet = walletRes.wallet || dashRes.wallet || { balance: 0, currency: "INR" };
    appState.transactions = walletRes.transactions || [];
    appState.services = { numbers: svcRes.numbers || [], emails: svcRes.emails || [] };
    appState.orders = ordRes.orders || [];
    appState.tickets = supRes.tickets || [];
    updateHeaderUI();
  } catch (err) {
    console.error("Sync error:", err.message);
  }
}

function renderAuthBox() {
  const mode = appState.authMode;

  if (mode === "forgot") {
    return `
      <div class="panel" style="max-width:440px;margin:20px auto 24px auto;">
        <h3>Reset Password</h3>
        <p class="demo-note">Enter your registered email address to receive a password reset link.</p>
        <label>EMAIL ADDRESS</label>
        <input class="page-input" type="email" id="forgotEmail" value="${escapeHtml(appState.lastLoginEmail || "")}" placeholder="you@example.com">
        <button class="primary-btn" id="forgotSubmitBtn" onclick="submitForgotPassword()">Send Reset Link</button>
        <button class="secondary-btn" style="margin-left:8px;" onclick="setAuthMode('login')">← Back to Login</button>
        <p id="authFeedback" style="margin-top:12px;"></p>
      </div>
    `;
  }

  const isLogin = mode === "login";
  return `
    <div class="panel" style="max-width:440px;margin:20px auto 24px auto;">
      <h3>${isLogin ? "Login to OTP MASTER" : "Create OTP MASTER Account"}</h3>
      <p class="demo-note">${isLogin ? "Sign in to access your wallet & virtual numbers." : "Register a free account to get started."}</p>
      ${!isLogin ? `<label>FULL NAME</label><input class="page-input" id="authName" placeholder="Enter your full name">` : ""}
      <label>EMAIL ADDRESS</label>
      <input class="page-input" type="email" id="authEmail" value="${escapeHtml(appState.lastLoginEmail || "")}" placeholder="you@example.com">
      <label>PASSWORD</label>
      <input class="page-input" type="password" id="authPassword" placeholder="Minimum 6 characters">
      ${!isLogin ? `<label>CONFIRM PASSWORD</label><input class="page-input" type="password" id="authConfirmPassword" placeholder="Re-enter your password">` : ""}
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:6px;">
        <button class="primary-btn" id="authSubmitBtn" onclick="submitAuthForm()">${isLogin ? "Login" : "Create Account"}</button>
        <button class="secondary-btn" onclick="toggleAuthMode()">${isLogin ? "New user? Sign up" : "Already have an account? Login"}</button>
      </div>
      ${isLogin ? `<div style="margin-top:12px;"><a href="#" onclick="event.preventDefault();setAuthMode('forgot');" style="color:#94a3b8;font-size:13px;text-decoration:underline;">Forgot Password?</a></div>` : ""}
      <p id="authFeedback" style="margin-top:12px;"></p>
      <div id="forgotPromptBox" style="display:none;margin-top:10px;padding:10px 12px;border-radius:10px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.35);">
        <span style="font-size:13px;color:#fca5a5;">Incorrect password? </span>
        <button class="secondary-btn" style="padding:5px 10px;font-size:12px;margin-left:6px;border-color:#ff7777;color:#ff7777;" onclick="setAuthMode('forgot')">Reset Password →</button>
      </div>
    </div>
  `;
}

function setAuthMode(newMode) {
  const emailVal = (document.getElementById("authEmail")?.value || "").trim();
  if (emailVal) appState.lastLoginEmail = emailVal;
  appState.authMode = newMode;
  const activeNav = document.querySelector(".nav-link.active");
  showPage(activeNav ? activeNav.dataset.page : "dashboard");
}

function toggleAuthMode() {
  setAuthMode(appState.authMode === "login" ? "signup" : "login");
}

async function submitForgotPassword() {
  const email = (document.getElementById("forgotEmail")?.value || "").trim();
  const feedback = document.getElementById("authFeedback");
  const btn = document.getElementById("forgotSubmitBtn");
  if (!email || !email.includes("@")) {
    feedback.textContent = "Please enter a valid email address.";
    feedback.style.color = "#ff7777";
    return;
  }
  btn.disabled = true;
  feedback.textContent = "Sending password reset request...";
  feedback.style.color = "#19c985";
  try {
    const res = await apiRequest("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email })
    });
    feedback.textContent = res.message || "Password reset instructions sent to your email ✅";
    feedback.style.color = "#19c985";
  } catch (err) {
    if (/route not found/i.test(err.message || "")) {
      feedback.innerHTML = `Reset email service is being activated. Contact admin on Telegram/Support with your email (<b>${escapeHtml(email)}</b>) for instant password reset.`;
      feedback.style.color = "#eab308";
    } else {
      feedback.textContent = err.message;
      feedback.style.color = "#ff7777";
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function submitAuthForm() {
  const email = (document.getElementById("authEmail")?.value || "").trim();
  const password = document.getElementById("authPassword")?.value || "";
  const confirmPassword = document.getElementById("authConfirmPassword")?.value || "";
  const fullName = (document.getElementById("authName")?.value || "").trim();
  const feedback = document.getElementById("authFeedback");
  const forgotBox = document.getElementById("forgotPromptBox");
  const btn = document.getElementById("authSubmitBtn");

  if (forgotBox) forgotBox.style.display = "none";
  appState.lastLoginEmail = email;

  if (!email || !password) {
    feedback.textContent = "Please enter email and password.";
    feedback.style.color = "#ff7777";
    return;
  }

  if (appState.authMode === "signup") {
    if (!fullName) {
      feedback.textContent = "Please enter your full name.";
      feedback.style.color = "#ff7777";
      return;
    }
    if (password.length < 6) {
      feedback.textContent = "Password must be at least 6 characters.";
      feedback.style.color = "#ff7777";
      return;
    }
    if (password !== confirmPassword) {
      feedback.textContent = "Password and Confirm Password do not match!";
      feedback.style.color = "#ff7777";
      return;
    }
  }

  btn.disabled = true;
  feedback.textContent = "Connecting to server...";
  feedback.style.color = "#19c985";
  try {
    if (appState.authMode === "signup") {
      await apiRequest("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ full_name: fullName, email, password })
      });
    }
    const loginRes = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    appState.token = loginRes.access_token;
    appState.user = loginRes.user;
    appState.wallet = loginRes.wallet || { balance: 0, currency: "INR" };
    localStorage.setItem("otpm_token", appState.token);
    await syncAccountData();
    showPage("dashboard");
  } catch (err) {
    feedback.textContent = err.message;
    feedback.style.color = "#ff7777";
    if (appState.authMode === "login" && forgotBox) {
      forgotBox.style.display = "block";
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

function logoutUser(reload = true) {
  appState.token = "";
  appState.user = null;
  appState.wallet = { balance: 0, currency: "INR" };
  appState.orders = [];
  appState.transactions = [];
  localStorage.removeItem("otpm_token");
  updateHeaderUI();
  if (reload) showPage("dashboard");
}

function handleLogout(e) {
  if (e) e.preventDefault();
  logoutUser(true);
}

function openBuyWithService(serviceId) {
  appState.selectedNumberId = serviceId;
  showPage("numbers");
}

function dashboardHTML() {
  if (!appState.token) return renderAuthBox();
  const displayName = appState.user?.full_name || appState.user?.email?.split("@")[0] || "User";
  const firstName = displayName.trim().split(" ")[0].toUpperCase();
  const balance = Number(appState.wallet?.balance || 0).toFixed(2);
  const totalRecharge = appState.transactions
    .filter(tx => tx.type === "credit" && tx.status === "completed")
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0)
    .toFixed(2);

  const topServices = appState.services.numbers.slice(0, 8);
  const servicesListHTML = topServices.length === 0
    ? `<p class="demo-note">Loading services...</p>`
    : topServices.map(s => `
        <div class="account-row" style="cursor:pointer;padding:12px 0;" onclick="openBuyWithService('${escapeHtml(s.id)}')">
          <div>
            <b>${s.country === "IN" ? "🇮🇳" : s.country === "US" ? "🇺🇸" : "🌍"} ${escapeHtml(s.service)}</b><br>
            <small style="color:#94a3b8;">${escapeHtml(s.country)} (${escapeHtml(s.dial_code)}) · Instant OTP</small>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <b style="color:#19c985;">₹${Number(s.price).toFixed(2)}</b>
            <span style="color:#64748b;">›</span>
          </div>
        </div>
      `).join("");

  return `
    <div class="welcome">
      <div>
        <span class="welcome-tag">HEY ${escapeHtml(firstName)} 👋</span>
        <h1>Welcome back, ${escapeHtml(displayName)}!</h1>
        <p>Get instant virtual numbers & receive OTPs in seconds.</p>
      </div>
      <div class="welcome-date" id="dashboardDate"></div>
    </div>
    <div class="quick-actions">
      <button class="primary-btn" onclick="showPage('numbers')">BUY NUMBERS</button>
      <button class="secondary-btn" onclick="showPage('wallet')">RECHARGE NOW</button>
    </div>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-top">Available Balance <span class="stat-icon green">₹</span></div>
        <h2>₹${balance}</h2>
        <small>Current wallet balance</small>
      </div>
      <div class="stat-card">
        <div class="stat-top">Total Recharge <span class="stat-icon blue">↗</span></div>
        <h2>₹${totalRecharge}</h2>
        <small>Total amount recharged</small>
      </div>
    </div>
    <div class="panel" style="margin-top:18px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h3 style="margin:0;">🔥 Top Services Overview</h3>
        <a href="#" onclick="event.preventDefault();showPage('numbers');" style="color:#19c985;font-size:13px;font-weight:700;text-decoration:none;">View All →</a>
      </div>
      ${servicesListHTML}
    </div>
  `;
}

function renderActiveNumbersSection() {
  const activeList = appState.orders.filter(
    o => o.order_type === "number" && (o.status === "active" || o.status === "received")
  );
  if (!activeList.length) {
    return `
      <div class="panel" style="margin-top:18px;text-align:center;">
        <h3>Active Numbers (0)</h3>
        <p class="demo-note">Select a service above and click Buy Now — your number & live OTP will appear right here.</p>
      </div>
    `;
  }
  return `
    <div class="panel" style="margin-top:18px;">
      <h3>Active Numbers (${activeList.length})</h3>
      ${activeList.map(o => `
        <div style="padding:14px;border-radius:12px;background:#0b1118;border:1px solid #1e293b;margin-top:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <b>${escapeHtml(o.service_name)} <span style="color:#19c985;">(₹${Number(o.price).toFixed(2)})</span></b>
            <span style="font-size:11px;padding:3px 8px;border-radius:999px;background:rgba(25,201,133,0.15);color:#19c985;font-weight:700;">${escapeHtml(o.status.toUpperCase())}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-radius:8px;background:#111822;margin-bottom:8px;">
            <b style="font-family:monospace;font-size:16px;">${escapeHtml(o.assigned_value)}</b>
            <button class="primary-btn" style="padding:6px 12px;font-size:12px;" onclick="copyText('${escapeHtml(o.assigned_value)}','Number Copied')">COPY</button>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-radius:8px;background:#111822;margin-bottom:10px;">
            ${o.otp_code
              ? `<b style="font-family:monospace;font-size:17px;color:#19c985;">OTP: ${escapeHtml(o.otp_code)}</b>
                 <button class="primary-btn" style="padding:6px 12px;font-size:12px;" onclick="copyText('${escapeHtml(o.otp_code)}','OTP Copied')">COPY OTP</button>`
              : `<span style="color:#eab308;font-size:13px;">⏳ Waiting for SMS •••••</span>
                 <button class="secondary-btn" style="padding:6px 10px;font-size:12px;" onclick="checkOrderSms('${escapeHtml(o.id)}')">CHECK SMS</button>`}
          </div>
          <div style="display:flex;gap:8px;">
            <button class="secondary-btn" style="flex:1;border-color:#ff7777;color:#ff7777;" onclick="cancelOrder('${escapeHtml(o.id)}')">CANCEL</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function numbersHTML() {
  if (!appState.token) return renderAuthBox();
  const preSelected = appState.services.numbers.find(s => s.id === appState.selectedNumberId);
  const selText = preSelected
    ? `${preSelected.service} (${preSelected.country}) — ₹${Number(preSelected.price).toFixed(2)}`
    : "No service selected";

  return `
    <div class="section-heading"><h2>Buy Virtual Numbers</h2><p>Choose your country and preferred service.</p></div>
    <div class="panel number-filter">
      <label>SELECT COUNTRY</label>
      <select class="page-input" id="countrySelect" onchange="updateNumberCards()">
        <option value="ALL">🌍 All Countries</option>
        <option value="IN">🇮🇳 India</option>
        <option value="US">🇺🇸 United States</option>
      </select>
      <label>SEARCH SERVICE</label>
      <input class="page-input" id="serviceSearch" placeholder="Search WhatsApp, Telegram..." oninput="updateNumberCards()">
    </div>
    <div class="section-heading"><h2>Available Services</h2><p id="countryLabel">Live services</p></div>
    <div class="number-grid" id="numberGrid"></div>
    <div class="panel selected-service">
      <h3>Selected Service</h3>
      <p id="selectedService">${escapeHtml(selText)}</p>
      <button class="primary-btn" id="buyNumberBtn" onclick="purchaseSelectedNumber()">Buy Now</button>
      <p id="purchaseMessage" style="margin-top:10px;"></p>
    </div>
    <div id="activeNumbersContainer">${renderActiveNumbersSection()}</div>
  `;
}

function updateNumberCards() {
  const country = document.getElementById("countrySelect").value;
  const search = document.getElementById("serviceSearch").value.toLowerCase();
  const grid = document.getElementById("numberGrid");
  const colors = ["green", "blue", "purple", "orange"];
  const filtered = appState.services.numbers.filter(item =>
    item.service.toLowerCase().includes(search) && (country === "ALL" || item.country === country)
  );
  if (!filtered.length) {
    grid.innerHTML = `<div class="panel empty-state"><b>No matching services</b><p>Try another search or country.</p></div>`;
    return;
  }
  grid.innerHTML = filtered.map((item, idx) => `
    <div class="number-card">
      <div class="number-top">
        <div class="service-icon ${colors[idx % colors.length]}">${escapeHtml(item.service[0])}</div>
        <span class="available">${escapeHtml(item.country)} (${escapeHtml(item.dial_code)})</span>
      </div>
      <h3>${escapeHtml(item.service)}</h3>
      <p>Instant virtual number</p>
      <div class="number-bottom">
        <b>₹${Number(item.price).toFixed(2)}</b>
        <button onclick="selectNumberService('${escapeHtml(item.id)}')">Select</button>
      </div>
    </div>
  `).join("");
}

function selectNumberService(serviceId) {
  const item = appState.services.numbers.find(s => s.id === serviceId);
  if (!item) return;
  appState.selectedNumberId = item.id;
  document.getElementById("selectedService").textContent = `${item.service} (${item.country}) — ₹${Number(item.price).toFixed(2)}`;
  document.getElementById("purchaseMessage").textContent = "";
}

async function purchaseSelectedNumber() {
  const msg = document.getElementById("purchaseMessage");
  const btn = document.getElementById("buyNumberBtn");
  if (!appState.selectedNumberId) {
    msg.textContent = "Please select a service first.";
    msg.style.color = "#ff7777";
    return;
  }
  btn.disabled = true;
  msg.textContent = "Activating number...";
  msg.style.color = "#19c985";
  try {
    const res = await apiRequest("/api/orders/buy", {
      method: "POST",
      body: JSON.stringify({ order_type: "number", service_id: appState.selectedNumberId })
    });
    appState.wallet.balance = res.balance;
    await syncAccountData();
    msg.textContent = `Activated: ${res.order.assigned_value} ✅`;
    const container = document.getElementById("activeNumbersContainer");
    if (container) container.innerHTML = renderActiveNumbersSection();
  } catch (err) {
    msg.textContent = err.message;
    msg.style.color = "#ff7777";
  } finally {
    if (btn) btn.disabled = false;
  }
}

function emailsHTML() {
  if (!appState.token) return renderAuthBox();
  return `
    <div class="section-heading">
      <h2>Buy Email Accounts</h2>
      <p>Instant temporary & alias email addresses.</p>
    </div>
    <div class="panel number-filter">
      <label>SEARCH EMAIL SERVICE</label>
      <input class="page-input" id="emailSearch" placeholder="Search Temp Mail, Alias..." oninput="updateEmailCards()">
    </div>
    <div class="section-heading">
      <h2>Email Services</h2>
      <p>Live catalogue</p>
    </div>
    <div class="number-grid" id="emailGrid"></div>
    <div class="panel selected-service">
      <h3>Selected Email</h3>
      <p id="selectedEmail">No email selected</p>
      <button class="primary-btn" id="buyEmailBtn" onclick="purchaseSelectedEmail()">Buy Email</button>
      <p id="emailMessage" style="margin-top:10px;"></p>
    </div>
  `;
}

function updateEmailCards() {
  const search = document.getElementById("emailSearch").value.toLowerCase();
  const grid = document.getElementById("emailGrid");
  const colors = ["blue", "purple", "green", "orange"];
  const filtered = appState.services.emails.filter(item =>
    item.service.toLowerCase().includes(search)
  );
  if (!filtered.length) {
    grid.innerHTML = `<div class="panel empty-state"><b>No matching email services</b><p>Try another search.</p></div>`;
    return;
  }
  grid.innerHTML = filtered.map((item, idx) => `
    <div class="number-card">
      <div class="number-top">
        <div class="service-icon ${colors[idx % colors.length]}">✉</div>
        <span class="available">@${escapeHtml(item.domain)}</span>
      </div>
      <h3>${escapeHtml(item.service)}</h3>
      <p>Instant inbox activation</p>
      <div class="number-bottom">
        <b>₹${Number(item.price).toFixed(2)}</b>
        <button onclick="selectEmailService('${escapeHtml(item.id)}')">Select</button>
      </div>
    </div>
  `).join("");
}

function selectEmailService(serviceId) {
  const item = appState.services.emails.find(e => e.id === serviceId);
  if (!item) return;
  appState.selectedEmailId = item.id;
  document.getElementById("selectedEmail").textContent = `${item.service} — ₹${Number(item.price).toFixed(2)}`;
  document.getElementById("emailMessage").textContent = "";
}

async function purchaseSelectedEmail() {
  const msg = document.getElementById("emailMessage");
  const btn = document.getElementById("buyEmailBtn");
  if (!appState.selectedEmailId) {
    msg.textContent = "Please select an email service first.";
    msg.style.color = "#ff7777";
    return;
  }
  btn.disabled = true;
  msg.textContent = "Creating email address...";
  msg.style.color = "#19c985";
  try {
    const res = await apiRequest("/api/orders/buy", {
      method: "POST",
      body: JSON.stringify({ order_type: "email", service_id: appState.selectedEmailId })
    });
    appState.wallet.balance = res.balance;
    await syncAccountData();
    msg.textContent = `Activated: ${res.order.assigned_value}`;
    setTimeout(() => showPage("mailhistory"), 1000);
  } catch (err) {
    msg.textContent = err.message;
    msg.style.color = "#ff7777";
  } finally {
    if (btn) btn.disabled = false;
  }
}

const QR_LIBRARY_URL = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
let qrState = { order: null, pollTimer: null, countdownTimer: null };

function walletHTML() {
  if (!appState.token) return renderAuthBox();
  const balance = Number(appState.wallet?.balance || 0).toFixed(2);
  const totalRecharge = appState.transactions
    .filter(tx => tx.type === "credit" && tx.status === "completed")
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0)
    .toFixed(2);

  const txHtml = appState.transactions.length === 0
    ? `<p class="demo-note">No transactions yet.</p>`
    : appState.transactions.slice(0, 15).map(tx => `
        <div class="account-row">
          <span>${escapeHtml(tx.description)}</span>
          <b style="color:${tx.type === "debit" ? "#ff7777" : "#19c985"}">
            ${tx.type === "debit" ? "-" : "+"}₹${Number(tx.amount).toFixed(2)}
          </b>
        </div>
      `).join("");

  const chipStyle = 'style="padding:8px 14px;margin:4px;border-radius:20px;border:1px solid #19c985;background:transparent;color:#19c985;cursor:pointer"';

  return `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-top">Available Balance</div>
        <h2>₹${balance}</h2>
        <small>Current balance</small>
      </div>
      <div class="stat-card">
        <div class="stat-top">Total Recharge</div>
        <h2>₹${totalRecharge}</h2>
        <small>Total recharged</small>
      </div>
    </div>
    <div class="panel" style="margin-top:20px">
      <h3>Recharge Wallet</h3>
      <p class="demo-note">⚠️ Minimum Recharge: ₹20 · UPI (PhonePe • Paytm • GPay)</p>
      <input class="page-input" type="number" min="20" id="rechargeAmount" placeholder="Enter amount (₹)">
      <div>
        <button ${chipStyle} onclick="setRechargeAmount(100)">₹100</button>
        <button ${chipStyle} onclick="setRechargeAmount(500)">₹500</button>
        <button ${chipStyle} onclick="setRechargeAmount(1000)">₹1000</button>
        <button ${chipStyle} onclick="setRechargeAmount(2000)">₹2000</button>
      </div>
      <button class="primary-btn" id="rechargeBtn" onclick="startQrRecharge()">Generate & Pay Now</button>
      <p id="rechargeMessage" style="margin-top:10px;"></p>
      <div id="qrPanel"></div>
    </div>
    <div class="panel" id="walletTransactionsBox" style="margin-top:18px">
      <h3>Wallet Transactions</h3>
      ${txHtml}
    </div>
  `;
}

function setRechargeAmount(value) {
  const input = document.getElementById("rechargeAmount");
  if (input) input.value = value;
}

function loadQrLibrary() {
  return new Promise((resolve, reject) => {
    if (window.QRCode) return resolve();
    const s = document.createElement("script");
    s.src = QR_LIBRARY_URL;
    s.onload = resolve;
    s.onerror = () => reject(new Error("QR library load nahi hui. Internet check kariye."));
    document.head.appendChild(s);
  });
}

function stopQrTimers() {
  clearInterval(qrState.pollTimer);
  clearInterval(qrState.countdownTimer);
  qrState.pollTimer = null;
  qrState.countdownTimer = null;
}

function setQrNotice(text, color) {
  const el = document.getElementById("utrMessage");
  if (!el) return;
  el.textContent = text;
  el.style.color = color || "#19c985";
}

async function startQrRecharge() {
  const amount = Number(document.getElementById("rechargeAmount").value);
  const message = document.getElementById("rechargeMessage");
  const btn = document.getElementById("rechargeBtn");
  if (!Number.isFinite(amount) || amount < 20) {
    message.textContent = "Minimum recharge ₹20 hai.";
    message.style.color = "#ff7777";
    return;
  }
  stopQrTimers();
  btn.disabled = true;
  message.textContent = "QR bana rahe hain...";
  message.style.color = "#19c985";
  try {
    await loadQrLibrary();
    const res = await apiRequest("/api/wallet/create-qr-order", {
      method: "POST",
      body: JSON.stringify({ amount })
    });
    qrState.order = res.order;
    message.textContent = "";
    renderQrPanel();
    startQrTimers();
  } catch (err) {
    message.textContent = err.message;
    message.style.color = "#ff7777";
  } finally {
    btn.disabled = false;
  }
}

function renderQrPanel() {
  const panel = document.getElementById("qrPanel");
  if (!panel || !qrState.order) return;
  const o = qrState.order;
  panel.innerHTML = `
    <div class="panel" style="margin-top:16px;text-align:center">
      <h3>Complete Payment</h3>
      <p>Order: <b>${escapeHtml(o.id.slice(0, 8))}</b> · <b>₹${Number(o.amount).toFixed(2)}</b></p>
      <div id="qrCanvas" style="display:flex;justify-content:center;margin:12px auto;background:#fff;padding:10px;border-radius:12px;width:fit-content"></div>
      <p>⏳ Expires in <b id="qrCountdown">--:--</b></p>
      <a href="${escapeHtml(o.upi_link)}" class="primary-btn" style="display:inline-block;text-decoration:none;margin:8px 0">Open UPI App</a>
      <ol style="text-align:left;margin-top:10px">
        <li>QR scan kariye (PhonePe, Paytm ya GPay se)</li>
        <li>Amount ₹${Number(o.amount).toFixed(2)} check karke payment kariye</li>
        <li>Payment ke baad 12-digit UTR (UPI Ref No.) copy kariye</li>
        <li>Neeche UTR daalkar Submit kariye</li>
      </ol>
      <input class="page-input" id="utrInput" inputmode="numeric" maxlength="12" placeholder="12-digit UTR">
      <button class="primary-btn" id="utrBtn" onclick="submitUtr()">Submit UTR</button>
      <p id="utrMessage" style="margin-top:10px;"></p>
      <button onclick="cancelQrPayment()" style="margin-top:10px;background:transparent;border:1px solid #ff7777;color:#ff7777;padding:8px 14px;border-radius:20px;cursor:pointer">✕ Cancel Payment</button>
    </div>
  `;
  try {
    new QRCode(document.getElementById("qrCanvas"), { text: o.upi_link, width: 220, height: 220 });
  } catch (e) {
    setQrNotice("QR image nahi bani. Upar 'Open UPI App' button use kariye.", "#ff7777");
  }
}

function startQrTimers() {
  stopQrTimers();
  const expiresAt = new Date(qrState.order.expires_at).getTime();
  const tick = () => {
    const el = document.getElementById("qrCountdown");
    if (!el) return stopQrTimers();
    const left = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
    el.textContent = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
  };
  tick();
  qrState.countdownTimer = setInterval(tick, 1000);
  qrState.pollTimer = setInterval(checkQrStatus, 5000);
}

async function checkQrStatus() {
  if (!qrState.order || !document.getElementById("qrPanel")) return stopQrTimers();
  try {
    const res = await apiRequest(`/api/wallet/check-qr/${encodeURIComponent(qrState.order.id)}`);
    const status = res.order.status;
    if (status === "approved") {
      stopQrTimers();
      qrState.order = null;
      await syncAccountData();
      showPage("wallet");
      alert("Wallet mein balance add ho gaya ✅");
    } else if (status === "rejected") {
      stopQrTimers();
      setQrNotice("Ye recharge reject ho gaya. Support se contact kariye.", "#ff7777");
    } else if (status === "expired") {
      stopQrTimers();
      setQrNotice("Ye QR expire ho gaya. Naya recharge banayiye.", "#ff7777");
    }
  } catch (err) {}
}

async function submitUtr() {
  const input = document.getElementById("utrInput");
  const btn = document.getElementById("utrBtn");
  const utr = (input?.value || "").replace(/\s/g, "");
  if (!/^\d{12}$/.test(utr)) {
    setQrNotice("UTR 12 digits ka hona chahiye.", "#ff7777");
    return;
  }
  btn.disabled = true;
  setQrNotice("UTR bhej rahe hain...", "#19c985");
  try {
    const res = await apiRequest("/api/wallet/submit-utr", {
      method: "POST",
      body: JSON.stringify({ order_id: qrState.order.id, utr })
    });
    setQrNotice(res.message, "#19c985");
    input.disabled = true;
  } catch (err) {
    setQrNotice(err.message, "#ff7777");
    btn.disabled = false;
  }
}

function cancelQrPayment() {
  stopQrTimers();
  qrState.order = null;
  const panel = document.getElementById("qrPanel");
  if (panel) panel.innerHTML = "";
  const msg = document.getElementById("rechargeMessage");
  if (msg) msg.textContent = "";
}

function renderOrdersList(typeFilter, emptyTitle, emptySub) {
  if (!appState.token) return renderAuthBox();
  const list = appState.orders.filter(o => o.order_type === typeFilter);
  if (!list.length) {
    return `
      <div class="panel">
        <div class="empty-state">
          <div class="empty-icon">◷</div>
          <b>${emptyTitle}</b>
          <p>${emptySub}</p>
        </div>
      </div>
    `;
  }
  const rows = list.map(o => `
    <div class="account-row" style="flex-wrap:wrap;gap:8px;">
      <div>
        <b>${escapeHtml(o.service_name)}</b> — <span>${escapeHtml(o.assigned_value)}</span><br>
        <small>₹${Number(o.price).toFixed(2)} · ${escapeHtml(o.status.toUpperCase())}</small>
      </div>
      <div>
        ${o.otp_code ? `<b>OTP: ${escapeHtml(o.otp_code)}</b>` : ""}
        ${o.status === "active"
          ? `<button class="secondary-btn" onclick="checkOrderSms('${escapeHtml(o.id)}')">Refresh</button>
             <button class="secondary-btn" onclick="cancelOrder('${escapeHtml(o.id)}')">Cancel</button>`
          : ""}
      </div>
    </div>
  `).join("");
  return `<div class="panel">${rows}</div>`;
}

async function checkOrderSms(orderId) {
  try {
    await apiRequest(`/api/orders/${encodeURIComponent(orderId)}/check`);
    await syncAccountData();
    const container = document.getElementById("activeNumbersContainer");
    if (container) {
      container.innerHTML = renderActiveNumbersSection();
    } else {
      const activeNav = document.querySelector(".nav-link.active");
      showPage(activeNav ? activeNav.dataset.page : "numbers");
    }
  } catch (err) {
    alert(err.message);
  }
}

async function cancelOrder(orderId) {
  try {
    const res = await apiRequest(`/api/orders/${encodeURIComponent(orderId)}/cancel`, { method: "POST" });
    appState.wallet.balance = res.balance;
    await syncAccountData();
    const container = document.getElementById("activeNumbersContainer");
    if (container) {
      container.innerHTML = renderActiveNumbersSection();
    } else {
      const activeNav = document.querySelector(".nav-link.active");
      showPage(activeNav ? activeNav.dataset.page : "numbers");
    }
  } catch (err) {
    alert(err.message);
  }
}

function updatesHTML() {
  if (!appState.updates.length) {
    return `<div class="panel"><h3>Latest Updates</h3><div class="empty-state"><div class="empty-icon">◉</div><b>No new updates</b><p>Announcements will appear here.</p></div></div>`;
  }
  const rows = appState.updates.map(u => `
    <div class="account-row" style="display:block;padding:12px 0;">
      <b>[${escapeHtml(u.tag.toUpperCase())}] ${escapeHtml(u.title)}</b>
      <p style="margin-top:4px;">${escapeHtml(u.content)}</p>
    </div>
  `).join("");
  return `<div class="panel"><h3>Latest Updates</h3>${rows}</div>`;
}

function supportHTML() {
  if (!appState.token) return renderAuthBox();
  const rows = appState.tickets.length === 0
    ? `<p class="demo-note">No tickets submitted yet.</p>`
    : appState.tickets.map(t => `
        <div class="account-row" style="display:block;padding:10px 0;">
          <b>${escapeHtml(t.subject)}</b> — <small>${escapeHtml(t.status.toUpperCase())}</small>
          <p>${escapeHtml(t.message)}</p>
          ${t.admin_reply ? `<p style="color:#19c985;"><b>Reply:</b> ${escapeHtml(t.admin_reply)}</p>` : ""}
        </div>
      `).join("");
  return `
    <div class="panel">
      <h3>Contact Support</h3>
      <p class="demo-note">Describe your issue below.</p>
      <input class="page-input" id="supportSubject" placeholder="Subject">
      <textarea class="page-input" id="supportMessage" rows="4" placeholder="Write your message..."></textarea>
      <button class="primary-btn" onclick="submitSupportTicket()">Submit Request</button>
      <p id="supportFeedback" style="margin-top:10px;"></p>
    </div>
    <div class="panel" style="margin-top:18px;">
      <h3>Your Support Tickets</h3>
      ${rows}
    </div>
  `;
}

async function submitSupportTicket() {
  const subject = (document.getElementById("supportSubject").value || "").trim();
  const message = (document.getElementById("supportMessage").value || "").trim();
  const feedback = document.getElementById("supportFeedback");
  if (!subject || !message) {
    feedback.textContent = "Please fill both subject and message.";
    feedback.style.color = "#ff7777";
    return;
  }
  try {
    await apiRequest("/api/support", { method: "POST", body: JSON.stringify({ subject, message }) });
    await syncAccountData();
    showPage("support");
  } catch (err) {
    feedback.textContent = err.message;
    feedback.style.color = "#ff7777";
  }
}

function profileHTML() {
  if (!appState.token) return renderAuthBox();
  return `
    <div class="panel">
      <h3>Personal Information</h3>
      <div class="account-row"><span>Name</span><b>${escapeHtml(appState.user?.full_name || "Not set")}</b></div>
      <div class="account-row"><span>Email</span><b>${escapeHtml(appState.user?.email || "")}</b></div>
      <div class="account-row"><span>Account Status</span><b class="status">● Active</b></div>
      <div class="account-row"><span>Account Type</span><b>${escapeHtml((appState.user?.role || "user").toUpperCase())}</b></div>
      <div style="margin-top:16px;">
        <label>UPDATE DISPLAY NAME</label>
        <input class="page-input" id="profileNameInput" value="${escapeHtml(appState.user?.full_name || "")}">
        <button class="primary-btn" onclick="updateProfileName()">Save Name</button>
        <p id="profileFeedback" style="margin-top:8px;"></p>
      </div>
    </div>
  `;
}

async function updateProfileName() {
  const fullName = (document.getElementById("profileNameInput").value || "").trim();
  const feedback = document.getElementById("profileFeedback");
  try {
    const res = await apiRequest("/api/profile", { method: "PATCH", body: JSON.stringify({ full_name: fullName }) });
    appState.user = res.profile;
    updateHeaderUI();
    feedback.textContent = "Profile updated!";
    feedback.style.color = "#19c985";
  } catch (err) {
    feedback.textContent = err.message;
    feedback.style.color = "#ff7777";
  }
}

function settingsHTML() {
  return `
    <div class="panel">
      <h3>Account Settings</h3>
      <div class="account-row"><span>Theme</span><b>Dark</b></div>
      <div class="account-row"><span>Backend API</span><b class="status">● Connected</b></div>
      <div class="account-row"><span>Version</span><b>1.0.0</b></div>
      ${appState.token ? `<button class="secondary-btn" style="margin-top:14px;" onclick="logoutUser()">Sign Out</button>` : ""}
    </div>
  `;
}

async function renderAdminPanel() {
  const content = document.getElementById("content");
  if (!content) return;
  content.innerHTML = `<div class="panel"><p class="demo-note">Loading pending requests...</p></div>`;
  try {
    const data = await apiRequest("/api/admin/recharges?status=submitted");
    const list = data.recharges || [];
    if (!list.length) {
      content.innerHTML = `
        <div class="panel" style="text-align:center;">
          <p class="demo-note">No pending recharge requests.</p>
          <button class="primary-btn" onclick="renderAdminPanel()">↻ Refresh</button>
        </div>
      `;
      return;
    }
    content.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <span>Pending: <b>${list.length}</b></span>
        <button class="primary-btn" style="padding:6px 12px;font-size:12px;" onclick="renderAdminPanel()">↻ Refresh</button>
      </div>
      ${list.map(r => `
        <div class="panel" id="adm-req-${escapeHtml(r.id)}" style="margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <b style="font-size:18px;color:#19c985;">₹${Number(r.amount).toFixed(2)}</b>
            <small>${new Date(r.created_at).toLocaleString()}</small>
          </div>
          <div style="margin-bottom:4px;">UTR: <b>${escapeHtml(r.utr || "-")}</b></div>
          <div style="font-size:12px;color:#94a3b8;margin-bottom:12px;">User: ${escapeHtml(r.user_email || r.user_id)}</div>
          <div style="display:flex;gap:10px;">
            <button class="primary-btn" style="flex:1;" onclick="handleAdminAction('${escapeHtml(r.id)}','approve')">✓ Approve</button>
            <button class="secondary-btn" style="flex:1;border-color:#ff7777;color:#ff7777;" onclick="handleAdminAction('${escapeHtml(r.id)}','reject')">✕ Reject</button>
          </div>
        </div>
      `).join("")}
    `;
  } catch (err) {
    content.innerHTML = `<div class="panel"><p style="color:#ff7777;">${escapeHtml(err.message)}</p></div>`;
  }
}

async function handleAdminAction(id, action) {
  const endpoint = action === "approve" ? `/api/admin/approve-recharge/${id}` : `/api/admin/reject-recharge/${id}`;
  try {
    await apiRequest(endpoint, { method: "POST" });
    const card = document.getElementById("adm-req-" + id);
    if (card) card.remove();
    await syncAccountData();
    alert(action === "approve" ? "Approved & Wallet Credited ✅" : "Request Rejected");
  } catch (err) {
    alert(err.message);
  }
}

function showPage(page, clickedLink = null) {
  if (!pageData[page]) return;
  document.getElementById("page-title").textContent = pageData[page][0];
  document.getElementById("page-subtitle").textContent = pageData[page][1];
  const content = document.getElementById("content");

  if (activeNumberPollTimer) {
    clearInterval(activeNumberPollTimer);
    activeNumberPollTimer = null;
  }

  if (page === "dashboard") {
    content.innerHTML = dashboardHTML();
    const dateEl = document.getElementById("dashboardDate");
    if (dateEl) {
      dateEl.textContent = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
    }
  } else if (page === "numbers") {
    content.innerHTML = numbersHTML();
    if (appState.token) {
      updateNumberCards();
      activeNumberPollTimer = setInterval(async () => {
        const activeOrders = appState.orders.filter(o => o.order_type === "number" && o.status === "active");
        if (!activeOrders.length) return;
        for (const o of activeOrders) {
          await apiRequest(`/api/orders/${encodeURIComponent(o.id)}/check`).catch(() => {});
        }
        await syncAccountData();
        const container = document.getElementById("activeNumbersContainer");
        if (container) container.innerHTML = renderActiveNumbersSection();
      }, 4000);
    }
  } else if (page === "emails") {
    content.innerHTML = emailsHTML();
    if (appState.token) updateEmailCards();
  } else if (page === "wallet") {
    content.innerHTML = walletHTML();
  } else if (page === "history") {
    content.innerHTML = renderOrdersList("number", "No number history", "Your number orders will appear here.");
  } else if (page === "mailhistory") {
    content.innerHTML = renderOrdersList("email", "No email history", "Your email orders will appear here.");
  } else if (page === "updates") {
    content.innerHTML = updatesHTML();
  } else if (page === "support") {
    content.innerHTML = supportHTML();
  } else if (page === "profile") {
    content.innerHTML = profileHTML();
  } else if (page === "settings") {
    content.innerHTML = settingsHTML();
  } else if (page === "admin") {
    renderAdminPanel();
  }

  document.querySelectorAll(".nav-link").forEach(link => {
    if (clickedLink) {
      link.classList.toggle("active", link === clickedLink);
    } else {
      link.classList.toggle("active", link.dataset.page === page && !link.dataset.scroll);
    }
  });
  closeMenu();
}

function toggleMenu() {
  document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("overlay").classList.toggle("show");
}

function closeMenu() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("overlay").classList.remove("show");
}

document.querySelectorAll(".nav-link").forEach(link => {
  link.addEventListener("click", function (event) {
    event.preventDefault();
    const page = this.dataset.page;
    if (!page) return;
    showPage(page, this);
    if (this.dataset.scroll === "tx") {
      setTimeout(() => {
        const txBox = document.getElementById("walletTransactionsBox");
        if (txBox) txBox.scrollIntoView({ behavior: "smooth" });
      }, 150);
    }
  });
});

(async function initApp() {
  updateHeaderUI();
  showPage("dashboard");
  await syncAccountData();
  const activeNav = document.querySelector(".nav-link.active");
  showPage(activeNav ? activeNav.dataset.page : "dashboard", activeNav);
})();

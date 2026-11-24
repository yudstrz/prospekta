# Prospekta Universal MCP Plugin

Plugin resmi untuk menghubungkan platform intelijen bisnis **Prospekta** ke berbagai ekosistem AI seperti **Gemini**, **ChatGPT**, **Claude**, dan **Cursor** melalui protokol **Model Context Protocol (MCP)**.

---

## 1. Arsitektur Hak Akses & Dua Peran (RBAC)

Setiap token MCP terikat secara kriptografis ke akun pengguna:

- **MCP User (`/api/mcp/user`):** Token berawalan `psk_usr_...`. Terisolasi ketat ke data milik akun pengguna sendiri (`userId`).
  - Tools: `location_search`, `location_list_mine`, `location_enrich`, `pdf_generate`, `pdf_list_mine`, `website_generate`, `website_list_mine`, `agent_ask`, `email_mcp_draft`, `email_mcp_send` (opsional).
- **MCP Admin (`/api/mcp/admin`):** Token berawalan `psk_adm_...`. Memiliki wewenang lintas akun dan tugas administratif.
  - Tools: Seluruh tool User + `admin_users_list`, `admin_user_upsert`, `admin_mcp_tokens_manage`, `admin_agent_get_config`, `admin_agent_update_knowledge`, `admin_locations_list_all`, `admin_websites_list_all`, `admin_audit_logs`.

---

## 2. Cara Menghubungkan ke Berbagai Klien AI

### A. Google Antigravity & Gemini CLI
Tambahkan server di `settings.json` atau jalankan CLI:
```json
{
  "mcpServers": {
    "prospekta": {
      "url": "https://<DOMAIN_PROSPEKTA>/customer-reach/api/mcp/user",
      "headers": {
        "Authorization": "Bearer <TOKEN_MCP_ANDA>"
      }
    }
  }
}
```
*(Ganti `/api/mcp/user` dengan `/api/mcp/admin` jika Anda memegang peran Admin).*

### B. ChatGPT (Custom GPT Actions)
1. Buka GPT Builder di ChatGPT > Tab **Configure** > **Create new action**.
2. Pilih **Import from URL** dan masukkan:
   ```text
   https://<DOMAIN_PROSPEKTA>/customer-reach/api/mcp/openapi.json?scope=user
   ```
   *(Atau `scope=admin` untuk GPT khusus manajemen).*
3. Pada **Authentication**:
   - Authentication Type: **API Key**
   - Auth Type: **Bearer**
   - API Key: Masukkan token MCP Anda (`psk_usr_...` atau `psk_adm_...`).

### C. Claude Desktop
Buka `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "prospekta": {
      "command": "node",
      "args": ["packages/prospekta-mcp-plugin/bin/prospekta-mcp.js"],
      "env": {
        "PROSPEKTA_MCP_URL": "https://<DOMAIN_PROSPEKTA>/customer-reach/api/mcp/user",
        "PROSPEKTA_MCP_TOKEN": "psk_usr_..."
      }
    }
  }
}
```

### D. Cursor IDE
Di menu **Cursor Settings > Features > MCP**:
- Name: `Prospekta`
- Type: `command`
- Command: `node packages/prospekta-mcp-plugin/bin/prospekta-mcp.js`
- Environment Variables:
  - `PROSPEKTA_MCP_URL=https://<DOMAIN_PROSPEKTA>/customer-reach/api/mcp/user`
  - `PROSPEKTA_MCP_TOKEN=psk_usr_...`

---

## 3. Fitur Email Opsional via MCP

Pengiriman email telah dibersihkan dari antarmuka dashboard utama. Jika pengguna ingin AI Agent dapat mengirimkan email atas namanya:
1. Hubungkan kredensial email (SMTP / Gmail App Password) di tab **Konektor Email MCP** pada dashboard Prospekta.
2. AI Agent di Gemini/GPT/Claude dapat memanggil tool `email_mcp_send` untuk mengirimkan penawaran atau laporan PDF/website.
3. Jika konektor belum dihubungkan, tool `email_mcp_send` akan menolak eksekusi secara aman tanpa mengganggu fitur inti lainnya.

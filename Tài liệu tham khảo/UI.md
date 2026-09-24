# 📋 TÀI LIỆU HỆ THỐNG THIẾT KẾ & UI SPECIFICATION (CHO VIBE CODING)
**Dự án:** Ứng dụng Quản lý Đầu việc & Dự án Cao cấp (Luxury & Friendly Task Management)  
**Mục đích:** Đặc tả kỹ thuật chi tiết (Tokens, Components, Layout Responsive, Menu 2 cấp) để AI / Vibe Coding có thể sinh mã (HTML/Tailwind CSS, React, Vue) chính xác 100%.

---

## 1. NGUYÊN TẮC THIẾT KẾ (DESIGN PRINCIPLES)
1. **Sang trọng (Refined Luxury):** Sử dụng tông màu Deep Slate Teal kết hợp điểm nhấn Warm Amber/Gold nhã nhặn, viền siêu mảnh (border 1px tinh tế), đổ bóng mờ nhẹ nhàng (soft ambient shadow).
2. **Thân thiện & Dễ tiếp cận (Warm & Human):** Bo góc mềm mại (`rounded-xl`, `rounded-2xl`), khoảng trống (whitespace) thoáng đãng, micro-interactions êm ái (`duration-200 ease-in-out`).
3. **Rõ ràng & Hiệu quả (Crisp & Scannable):** Phân cấp typography chặt chẽ, badge trạng thái màu sắc pastel chuẩn WCAG AAA, phân biệt rõ ràng giữa các cấp menu và độ ưu tiên công việc.
4. **Responsive Native:** Desktop ưu tiên không gian làm việc rộng rãi với Sidebar 2 cấp; Mobile tự động co gọn vào Off-canvas Drawer hoặc Bottom Navigation Bar tiện lợi một tay.

---

## 2. DESIGN TOKENS (HỆ MÀU & TYPOGRAPHY)

### 2.1 Bảng màu (Color Palette - Tailwind CSS Mapping)
```json
{
  "colors": {
    "brand": {
      "primary": "#0F2F2E",       // Xanh ngọc bích thẫm (Deep Emerald / Slate Teal)
      "primary-hover": "#164543",
      "primary-light": "#E6F0EE",
      "accent": "#D97706",        // Vàng hổ phách / Champagne Gold quý phái
      "accent-light": "#FEF3C7"
    },
    "surface": {
      "bg-page": "#F8FAFC",       // Nền tổng thể mát mẻ, êm dịu (Slate 50)
      "card": "#FFFFFF",          // Nền thẻ trắng tinh khiết
      "sidebar": "#FFFFFF",       // Nền sidebar thanh lịch
      "sidebar-sub": "#F1F5F9",   // Nền cấp 2 của sidebar
      "border": "#E2E8F0"         // Viền phân cách mỏng 1px
    },
    "text": {
      "heading": "#0F172A",       // Slate 900 (Độ tương phản cao nhất)
      "body": "#334155",          // Slate 700 (Dễ đọc cho nội dung dài)
      "muted": "#64748B",         // Slate 500 (Ghi chú, timestamp, label phụ)
      "placeholder": "#94A3B8"
    },
    "status": {
      "todo": { "bg": "#F1F5F9", "text": "#475569", "border": "#CBD5E1" },
      "in_progress": { "bg": "#EFF6FF", "text": "#1D4ED8", "border": "#BFDBFE" },
      "review": { "bg": "#FFFBEB", "text": "#B45309", "border": "#FDE68A" },
      "completed": { "bg": "#ECFDF5", "text": "#047857", "border": "#A7F3D0" },
      "urgent": { "bg": "#FEF2F2", "text": "#B91C1C", "border": "#FECACA" }
    }
  }
}
```

### 2.2 Typography (Kiểu chữ & Cỡ chữ)
* **Font Family:** `font-family: 'Plus Jakarta Sans', 'Inter', system-ui, sans-serif;`
* **Hierarchy:**
  - `H1 (Page Title):` `text-2xl lg:text-3xl font-bold tracking-tight text-slate-900`
  - `H2 (Section Header):` `text-lg lg:text-xl font-semibold text-slate-800`
  - `H3 (Card Title):` `text-base font-medium text-slate-800`
  - `Body / Task Title:` `text-sm font-normal text-slate-700 leading-relaxed`
  - `Caption / Meta Info:` `text-xs font-medium text-slate-500`

---

## 3. KIẾN TRÚC LAYOUT RESPONSIVE & MENU 2 CẤP

### 3.1 Cấu trúc màn hình Desktop (`min-width: 1024px`)
* **Bố cục tổng quan:** `flex h-screen overflow-hidden bg-[#F8FAFC]`
* **Sidebar Trái (Width cố định `w-72` hoặc `w-80`):**
  - **Header:** Logo thương hiệu + Tên Workspace (có Dropdown đổi Workspace).
  - **Menu Cấp 1 (Primary Navigation):**
    - 📊 *Tổng quan (Dashboard)*
    - 📁 *Dự án & Không gian làm việc (Workspaces)* -> Click để mở rộng Cấp 2
    - 📅 *Lịch công việc (Calendar & Timeline)*
    - 👥 *Nhóm làm việc (Team & Members)*
    - ⚙️ *Cài đặt (Settings)*
  - **Menu Cấp 2 (Nested / Sub-menu dưới "Dự án"):**
    - ↳ 🟢 Dự án Tái thiết kế Website (5 đầu việc)
    - ↳ 🔵 Chiến dịch Ra mắt Q3 (12 đầu việc)
    - ↳ 🟣 Hệ thống Quản trị Khách hàng (8 đầu việc)
    - ↳ ➕ *Tạo dự án mới*
  - **Footer Sidebar:** Thẻ trạng thái bộ nhớ / Nâng cấp Pro + Thông tin cá nhân (Avatar, Tên, Nút Đăng xuất).
* **Main Content Area (`flex-1 flex flex-col overflow-y-auto`):**
  - **Top Bar:** Ô tìm kiếm tức thời (Search Bar `Ctrl + K`), Nút thông báo (Notification badge), Nút bấm chính "➕ Tạo công việc mới" (Primary CTA mạ vàng/emerald).
  - **Khung nội dung chính:** Tab view (Kanban Board, Danh sách Task List, Lịch Calendar), Bộ lọc Filter & Sort, và Grid/List đầu việc.

### 3.2 Cấu trúc màn hình Mobile (`max-width: 768px`)
* **Header Mobile:**
  - Nút Hamburger Menu (Mở Drawer chứa toàn bộ Menu 2 cấp).
  - Tên App hoặc Dự án hiện tại.
  - Avatar người dùng / Nút tạo nhanh.
* **Drawer / Off-canvas:**
  - Trượt mượt mà từ cạnh trái (`translate-x-0 transition-transform duration-300`).
  - Menu 2 cấp dạng Accordion (bấm vào Cấp 1 sẽ xổ mượt xuống Cấp 2).
* **Bottom Navigation Bar (Cố định ở đáy màn hình):**
  - 4 nút thao tác nhanh: [Trang chủ] - [Nhiệm vụ] - [Nút dấu ➕ nổi bật] - [Thông báo] - [Cá nhân].
* **Thẻ Task Card trên Mobile:**
  - Thiết kế chạm tối ưu (Touch target tối thiểu 44x44px).
  - Thao tác quẹt vuốt (Swipe actions: Vuốt phải hoàn thành, vuốt trái hẹn lại).

---

## 4. CODE MẪU CHUẨN HTML + TAILWIND CSS (CHO VIBE CODING)

Dưới đây là khung sườn hoàn chỉnh có thể paste trực tiếp vào code:

```html
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Task Manager - Luxury & Crisp Style</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Plus Jakarta Sans', sans-serif; }
  </style>
</head>
<body class="bg-[#F8FAFC] text-slate-800 antialiased h-screen flex overflow-hidden">

  <!-- SIDEBAR (MENU 2 CẤP TRÊN DESKTOP, OFF-CANVAS TRÊN MOBILE) -->
  <aside id="sidebar" class="fixed inset-y-0 left-0 z-40 w-72 bg-white border-r border-slate-200 transform -translate-x-full lg:translate-x-0 lg:static lg:inset-auto transition-transform duration-300 flex flex-col justify-between">
    
    <!-- 1. Header Sidebar -->
    <div class="p-6 border-b border-slate-100">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-[#0F2F2E] flex items-center justify-center text-amber-400 font-bold text-lg shadow-sm">
          ✦
        </div>
        <div>
          <h2 class="font-bold text-slate-900 tracking-tight leading-tight">Atelier Task</h2>
          <span class="text-xs text-slate-400 font-medium">Workspace Doanh Nghiệp</span>
        </div>
      </div>
    </div>

    <!-- 2. Menu Điều hướng (Cấp 1 & Cấp 2) -->
    <div class="flex-1 overflow-y-auto px-4 py-5 space-y-1">
      
      <!-- Cấp 1: Mục đơn -->
      <a href="#" class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold bg-[#0F2F2E] text-white shadow-sm transition">
        <svg class="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>
        Bảng điều khiển
      </a>

      <!-- Cấp 1: Có Dropdown con (Cấp 2) -->
      <div class="pt-2">
        <button class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition group">
          <span class="flex items-center gap-3">
            <svg class="w-5 h-5 text-slate-400 group-hover:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
            Dự án trọng tâm
          </span>
          <!-- Mũi tên chỉ thị -->
          <svg class="w-4 h-4 text-slate-400 transform rotate-90 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
        </button>

        <!-- MENU CẤP 2 (SUB-ITEMS) -->
        <div class="mt-1 ml-4 pl-4 border-l-2 border-slate-100 space-y-1">
          <a href="#" class="flex items-center justify-between px-3 py-2 rounded-lg text-sm text-slate-600 hover:text-[#0F2F2E] hover:bg-slate-50 transition">
            <span class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
              Website Redesign
            </span>
            <span class="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">5</span>
          </a>
          <a href="#" class="flex items-center justify-between px-3 py-2 rounded-lg text-sm text-slate-600 hover:text-[#0F2F2E] hover:bg-slate-50 transition">
            <span class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-amber-500"></span>
              Chiến dịch Q3
            </span>
            <span class="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">12</span>
          </a>
          <a href="#" class="flex items-center justify-between px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-700 transition">
            <span class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-slate-300"></span>
              App Mobile
            </span>
            <span class="text-xs bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full">3</span>
          </a>
        </div>
      </div>

      <!-- Mục cấp 1 khác -->
      <a href="#" class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition">
        <svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
        Lịch & Tiến độ
      </a>
      <a href="#" class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition">
        <svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
        Thành viên
      </a>
    </div>

    <!-- 3. Footer Sidebar -->
    <div class="p-4 border-t border-slate-100 bg-slate-50/50">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-full bg-[#0F2F2E] text-white flex items-center justify-center font-bold text-xs">
            AL
          </div>
          <div>
            <p class="text-sm font-semibold text-slate-800">Alex Le</p>
            <p class="text-xs text-slate-400">Design Lead</p>
          </div>
        </div>
        <button class="text-slate-400 hover:text-slate-600 p-1">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
        </button>
      </div>
    </div>
  </aside>

  <!-- MAIN VIEWPORT -->
  <main class="flex-1 flex flex-col min-w-0 overflow-y-auto">
    
    <!-- TOP NAVIGATION BAR -->
    <header class="h-16 bg-white border-b border-slate-200 px-4 lg:px-8 flex items-center justify-between sticky top-0 z-30">
      <div class="flex items-center gap-3">
        <!-- Nút toggle sidebar cho Mobile -->
        <button class="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
        </button>
        <h1 class="text-lg lg:text-xl font-bold text-slate-900">Chiến dịch Ra mắt Q3</h1>
        <span class="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          Đang tiến hành
        </span>
      </div>

      <!-- Quick Actions -->
      <div class="flex items-center gap-3">
        <button class="bg-[#0F2F2E] hover:bg-[#164543] text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-sm flex items-center gap-2 transition">
          <span class="text-amber-400 font-bold">+</span>
          <span class="hidden sm:inline">Giao việc mới</span>
        </button>
      </div>
    </header>

    <!-- CONTENT BODY (TASK CARDS) -->
    <section class="p-4 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
      
      <!-- Task Card Mẫu: Phong cách Sang trọng & Thân thiện -->
      <div class="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-[0_2px_8px_rgba(15,47,46,0.04)] hover:shadow-[0_8px_20px_rgba(15,47,46,0.08)] transition-all group">
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-start gap-3">
            <input type="checkbox" class="mt-1 w-5 h-5 rounded-md border-slate-300 text-[#0F2F2E] focus:ring-[#0F2F2E]">
            <div>
              <h3 class="text-base font-semibold text-slate-900 group-hover:text-[#0F2F2E] transition">
                Hoàn thiện Prototype Flow Đăng nhập & Xác thực 2 bước
              </h3>
              <p class="text-xs text-slate-500 mt-1">Cần đồng bộ với bộ icon mới và đảm bảo responsive cho mobile Safari.</p>
            </div>
          </div>
          <span class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-50 text-red-700 border border-red-200 flex-shrink-0">
            Ưu tiên cao
          </span>
        </div>

        <!-- Meta tags bên dưới thẻ -->
        <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
          <div class="flex items-center gap-4">
            <span class="flex items-center gap-1 text-slate-600 font-medium">
              📅 Ngày mai, 17:00
            </span>
            <span class="flex items-center gap-1">
              💬 4 thảo luận
            </span>
          </div>
          <div class="flex -space-x-1.5 overflow-hidden">
            <div class="w-6 h-6 rounded-full bg-slate-200 border-2 border-white text-[10px] flex items-center justify-center font-bold text-slate-700">HN</div>
            <div class="w-6 h-6 rounded-full bg-[#0F2F2E] border-2 border-white text-[10px] flex items-center justify-center font-bold text-amber-300">AL</div>
          </div>
        </div>
      </div>

    </section>
  </main>

  <!-- MOBILE BOTTOM BAR (CHỈ HIỂN THỊ TRÊN MOBILE) -->
  <nav class="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 px-6 py-2 flex justify-between items-center z-30 shadow-lg">
    <a href="#" class="flex flex-col items-center text-[#0F2F2E]">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
      <span class="text-[10px] font-semibold mt-0.5">Tổng quan</span>
    </a>
    <a href="#" class="flex flex-col items-center text-slate-400">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
      <span class="text-[10px] font-medium mt-0.5">Dự án</span>
    </a>
    <div class="-mt-5">
      <button class="w-12 h-12 rounded-full bg-[#0F2F2E] text-amber-400 flex items-center justify-center shadow-lg font-bold text-xl">
        +
      </button>
    </div>
    <a href="#" class="flex flex-col items-center text-slate-400">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
      <span class="text-[10px] font-medium mt-0.5">Thông báo</span>
    </a>
    <a href="#" class="flex flex-col items-center text-slate-400">
      <div class="w-5 h-5 rounded-full bg-slate-300 text-[10px] flex items-center justify-center font-bold text-slate-700">AL</div>
      <span class="text-[10px] font-medium mt-0.5">Cá nhân</span>
    </a>
  </nav>

</body>
</html>
```

---

## 5. HƯỚNG DẪN PROMPT CHO VIBE CODING (PROMPT TEMPLATES)
Khi đưa tài liệu này vào AI Coding (Cursor, Copilot, v0, Windsurf...), hãy đính kèm prompt sau:
> *"Hãy áp dụng toàn bộ token màu sắc, typography và cấu trúc responsive trong tài liệu trên. Khi xây dựng UI dạng Web Desktop, hãy giữ nguyên Menu Sidebar bên trái 2 cấp (Cấp 1 xổ xuống các dự án con ở Cấp 2 với vạch border-l nối mượt mà). Trên Mobile, hãy ẩn sidebar và hiển thị Bottom Navigation 5 điểm chạm. Phong cách tổng thể phải toát lên nét sang trọng với nền Slate Teal `#0F2F2E`, viền mờ `#E2E8F0` và các điểm nhấn Gold `#D97706`."*

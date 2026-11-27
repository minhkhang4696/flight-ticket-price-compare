# SkyCompare — Flight Route Price Comparison Web App

Ứng dụng web so sánh giá vé máy bay theo các route bay nhất định để tìm ra giá vé rẻ nhất, hỗ trợ sân bay toàn cầu, chọn lịch theo năm, biểu đồ xu hướng 60 ngày và kết nối dữ liệu realtime qua SerpApi (Google Flights) hoặc Amadeus API.

## Tính năng chính
- **So sánh đa route song song**: Ghim và so sánh nhiều tuyến bay cùng lúc, tự động làm nổi bật chuyến bay & route rẻ nhất.
- **Sân bay toàn thế giới**: Hỗ trợ tìm kiếm 119+ sân bay lớn toàn cầu và nhập bất kỳ mã IATA 3 chữ cái nào.
- **Lịch năm & Biểu đồ 60 ngày**: Chọn bất kỳ ngày bay nào trên lịch năm hoặc nhấp trực tiếp trên biểu đồ giá 60 ngày tới.
- **Tra giá Realtime (tuỳ chọn)**: Hỗ trợ gắn API Key từ **SerpApi (Google Flights)** hoặc **Amadeus Self-Service API** ngay trên giao diện (`⚙ API Realtime`).
- **Cảnh báo giá mục tiêu**: Theo dõi các route đạt ngưỡng giá mong muốn.

## Cách chạy
Yêu cầu: Python 3.10+ (không cần cài thêm thư viện ngoài).

```bash
python3 server.py
```

Mở trình duyệt tại: `http://127.0.0.1:8080`

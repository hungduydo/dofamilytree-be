/* One-off seed for Articles + MediaAlbums + Media so /news and /library have real content. */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ARTICLES = [
  { title: 'Lễ giỗ Tổ họ Đỗ Khắc năm 2026', category: 'announcement', featured: true, views: 1256, date: '2026-02-20',
    excerpt: 'Thông báo chương trình Lễ giỗ Tổ sẽ được tổ chức vào ngày 15/03 (âm lịch) tại nhà thờ họ Đỗ Khắc, Đồng Nai.',
    content: 'Hội đồng gia tộc trân trọng thông báo Lễ giỗ Tổ họ Đỗ Khắc năm 2026 sẽ được tổ chức vào ngày 15/03 (âm lịch) tại nhà thờ họ, Đồng Nai. Chương trình gồm lễ dâng hương, đọc gia phả, và tiệc họp mặt con cháu các chi.' },
  { title: 'Họp mặt con cháu toàn họ đầu xuân Bính Ngọ', category: 'activity', views: 856, date: '2026-02-10',
    excerpt: 'Buổi họp mặt đầu năm quy tụ hơn 200 con cháu từ khắp các chi họ về tham dự, ôn lại truyền thống gia tộc.',
    content: 'Buổi họp mặt đầu xuân Bính Ngọ đã quy tụ hơn 200 con cháu từ khắp các chi họ về tham dự tại nhà thờ tổ.' },
  { title: 'Câu chuyện về cụ tổ Đỗ Khắc Chân', category: 'story', views: 642, date: '2026-02-05',
    excerpt: 'Ghi chép lại hành trình lập nghiệp và những đóng góp của cụ tổ đời thứ nhất cho vùng đất Đồng Nai.',
    content: 'Bài viết ghi chép lại hành trình lập nghiệp của cụ tổ Đỗ Khắc Chân — người đặt nền móng đầu tiên cho dòng họ tại vùng đất Đồng Nai đầu thế kỷ XIX.' },
  { title: 'Hoàn thành tu bổ nhà thờ họ chi 3', category: 'construction', views: 1024, date: '2026-01-28',
    excerpt: 'Sau 6 tháng thi công, nhà thờ họ chi 3 đã hoàn thành tu bổ với kinh phí đóng góp từ toàn thể con cháu.',
    content: 'Sau 6 tháng thi công, công trình tu bổ nhà thờ họ chi 3 đã hoàn thành với tổng kinh phí đóng góp từ toàn thể con cháu trong và ngoài nước.' },
  { title: 'Gia phả họ Đỗ Khắc bản gốc đời thứ 1 - 10', category: 'archive', featured: true, views: 521, date: '2026-01-20',
    excerpt: 'Bản scan gia phả cổ được lưu giữ tại nhà thờ họ, ghi chép chi tiết 10 đời đầu tiên của dòng họ.',
    content: 'Bản scan gia phả cổ được lưu giữ tại nhà thờ họ nay đã được số hóa, ghi chép chi tiết 10 đời đầu tiên của dòng họ Đỗ Khắc.' },
  { title: 'Quỹ khuyến học dòng họ trao thưởng năm học 2025 - 2026', category: 'activity', views: 789, date: '2026-01-12',
    excerpt: 'Hội đồng gia tộc trao 32 suất học bổng cho con cháu có thành tích học tập xuất sắc trong năm học vừa qua.',
    content: 'Hội đồng gia tộc đã trao 32 suất học bổng cho con cháu có thành tích học tập xuất sắc trong năm học 2025 - 2026.' },
  { title: 'Kế hoạch xây dựng cổng tam quan nhà thờ tổ', category: 'construction', views: 445, date: '2026-01-05',
    excerpt: 'Ban kiến thiết công bố bản vẽ và kế hoạch huy động đóng góp xây dựng cổng tam quan trong năm 2026.',
    content: 'Ban kiến thiết đã công bố bản vẽ thiết kế và kế hoạch huy động đóng góp xây dựng cổng tam quan nhà thờ tổ, dự kiến khởi công trong quý III năm 2026.' },
  { title: 'Phong tục cúng giỗ của dòng họ qua các thời kỳ', category: 'other', views: 312, date: '2025-12-18',
    excerpt: 'Tìm hiểu sự thay đổi trong nghi thức cúng giỗ tổ tiên của dòng họ từ xưa đến nay.',
    content: 'Bài viết tìm hiểu sự thay đổi trong nghi thức cúng giỗ tổ tiên của dòng họ từ xưa đến nay.' },
  { title: 'Thông báo cập nhật thông tin thành viên trên hệ thống', category: 'announcement', views: 198, date: '2025-12-10',
    excerpt: 'Ban quản trị đề nghị các thành viên kiểm tra và cập nhật thông tin cá nhân trên hệ thống gia phả điện tử.',
    content: 'Ban quản trị đề nghị toàn thể thành viên đăng nhập hệ thống gia phả điện tử để kiểm tra và cập nhật thông tin cá nhân.' },
];

const ALBUMS = [
  { name: 'Lễ giỗ Tổ 2026', date: '2026-03-15' },
  { name: 'Họp mặt con cháu 2025', date: '2025-09-10' },
  { name: 'Ảnh xưa dòng họ', date: '1960 - 1990' },
  { name: 'Di tích & Nhà thờ họ', date: '2025-06-27' },
  { name: 'Gia phả cổ & Văn bia', date: 'Nhiều thời kỳ' },
];

const MB = 1024 * 1024;
const UPLOADERS = ['Đỗ Văn An', 'Đỗ Thị Bình', 'Ban truyền thông dòng họ'];

async function main() {
  const uploaderId = '00000000-0000-0000-0000-000000000000';

  const existingArticles = await prisma.article.count();
  if (existingArticles === 0) {
    for (const a of ARTICLES) {
      await prisma.article.create({ data: { ...a, date: new Date(a.date), featured: a.featured ?? false } });
    }
    console.log(`Seeded ${ARTICLES.length} articles`);
  } else {
    console.log(`Articles already present (${existingArticles}), skipping`);
  }

  const existingAlbums = await prisma.mediaAlbum.count();
  if (existingAlbums === 0) {
    const albumRows = [];
    for (const al of ALBUMS) albumRows.push(await prisma.mediaAlbum.create({ data: al }));
    console.log(`Seeded ${albumRows.length} albums`);

    const items = [
      { title: 'Lễ giỗ Tổ 2026_01.jpg', type: 'image', album: 0, size: 2.4, views: 2456, u: 0 },
      { title: 'Toàn cảnh nhà thờ họ.jpg', type: 'image', album: 3, size: 3.1, views: 1102, u: 1 },
      { title: 'Phóng sự Lễ giỗ Tổ 2026.mp4', type: 'video', album: 0, size: 120, views: 1892, u: 2 },
      { title: 'Họp mặt con cháu 2025.jpg', type: 'image', album: 1, size: 1.8, views: 634, u: 0 },
      { title: 'Bài ca truyền thống họ Đỗ Khắc.mp3', type: 'audio', album: 4, size: 3.7, views: 421, u: 2 },
      { title: 'Gia phả họ Đỗ Khắc (bản gốc).pdf', type: 'document', album: 4, size: 24.5, views: 1256, u: 1 },
      { title: 'Văn bia nhà thờ họ.jpg', type: 'image', album: 3, size: 2.2, views: 388, u: 0 },
      { title: 'Phim tài liệu dòng họ.mkv', type: 'video', album: 2, size: 520, views: 967, u: 2 },
      { title: 'Ảnh xưa 1980.jpg', type: 'image', album: 2, size: 1.6, views: 512, u: 1 },
      { title: 'Nội quy dòng họ.docx', type: 'document', album: 4, size: 1.2, views: 276, u: 0 },
    ];
    for (const it of items) {
      await prisma.media.create({
        data: {
          file_path: `/library/${it.title}`,
          uploader_id: uploaderId,
          uploader_name: UPLOADERS[it.u],
          title: it.title,
          type: it.type,
          album_id: albumRows[it.album].id,
          views: it.views,
          size_bytes: Math.round(it.size * MB),
        },
      });
    }
    console.log(`Seeded ${items.length} media items`);
  } else {
    console.log(`Albums already present (${existingAlbums}), skipping media seed`);
  }
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

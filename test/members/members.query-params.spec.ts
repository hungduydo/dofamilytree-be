import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { MembersController } from '../../src/members/members.controller';
import { MembersService } from '../../src/members/members.service';
import { JwtAuthGuard } from '../../src/auth/jwt.guard';

const mockMembersService = {
  getAllMembers: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 10 }),
  searchMembers: jest.fn(),
  getMemberById: jest.fn(),
  createMember: jest.fn(),
  getMemberProfile: jest.fn(),
  updateMemberProfile: jest.fn(),
  deleteMember: jest.fn(),
  recomputeGenerations: jest.fn(),
  getCommitteeMembers: jest.fn(),
  getNotableMembers: jest.fn(),
  getMemberStats: jest.fn(),
};

/**
 * Chạy qua HTTP thật với đúng global pipe của main.ts — unit test gọi thẳng
 * method của controller sẽ BỎ QUA toàn bộ pipe, nên không bắt được lỗi 400 nào.
 */
describe('GET /members query params (HTTP thật)', () => {
  let app: INestApplication;
  let url: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MembersController],
      providers: [{ provide: MembersService, useValue: mockMembersService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('v2');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    url = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
  });

  const get = async (qs: string) => {
    const res = await fetch(`${url}/v2/members${qs}`);
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  it('page + pageSize, không truyền generation', async () => {
    const res = await get('?page=1&pageSize=100');
    expect(res.status).toBe(200);
  });

  it('không truyền tham số nào', async () => {
    const res = await get('');
    expect(res.status).toBe(200);
  });

  it('có generation', async () => {
    const res = await get('?page=1&pageSize=10&generation=3');
    expect(res.status).toBe(200);
    expect(mockMembersService.getAllMembers).toHaveBeenLastCalledWith(1, 10, undefined, 3, undefined, undefined, 'full', undefined, undefined);
  });

  it('generation rỗng (FE gửi generation=) là KHÔNG lọc, không phải lọc thế hệ 0', async () => {
    const res = await get('?page=1&pageSize=10&generation=');
    expect(res.status).toBe(200);
    // Regression: ValidationPipe({transform:true}) từng ép '' thành 0, mà 0 là
    // một thế hệ có thật trong dữ liệu → lọc nhầm thay vì bỏ lọc.
    expect(mockMembersService.getAllMembers).toHaveBeenLastCalledWith(1, 10, undefined, undefined, undefined, undefined, 'full', undefined, undefined);
  });

  it('generation=0 vẫn lọc được (0 là thế hệ có thật)', async () => {
    const res = await get('?generation=0');
    expect(res.status).toBe(200);
    expect(mockMembersService.getAllMembers).toHaveBeenLastCalledWith(1, 10, undefined, 0, undefined, undefined, 'full', undefined, undefined);
  });

  it('có sortBy + sortOrder', async () => {
    const res = await get('?sortBy=generation&sortOrder=asc');
    expect(res.status).toBe(200);
    expect(mockMembersService.getAllMembers).toHaveBeenLastCalledWith(1, 10, undefined, undefined, 'generation', 'asc', 'full', undefined, undefined);
  });

  it('generation không phải số → 400', async () => {
    const res = await get('?generation=abc');
    expect(res.status).toBe(400);
  });

  it('name filter vẫn hoạt động khi không có generation', async () => {
    const res = await get('?name=nguyen');
    expect(res.status).toBe(200);
    expect(mockMembersService.getAllMembers).toHaveBeenLastCalledWith(1, 10, 'nguyen', undefined, undefined, undefined, 'full', undefined, undefined);
  });

  it('view=lite được truyền thẳng', async () => {
    const res = await get('?view=lite');
    expect(res.status).toBe(200);
    expect(mockMembersService.getAllMembers).toHaveBeenLastCalledWith(1, 10, undefined, undefined, undefined, undefined, 'lite', undefined, undefined);
  });

  it('view rỗng → full (không 400)', async () => {
    const res = await get('?view=');
    expect(res.status).toBe(200);
    expect(mockMembersService.getAllMembers).toHaveBeenLastCalledWith(1, 10, undefined, undefined, undefined, undefined, 'full', undefined, undefined);
  });

  it('view lạ → full', async () => {
    const res = await get('?view=bogus');
    expect(res.status).toBe(200);
    expect(mockMembersService.getAllMembers).toHaveBeenLastCalledWith(1, 10, undefined, undefined, undefined, undefined, 'full', undefined, undefined);
  });

  it('tree_id + gender được truyền thẳng', async () => {
    const res = await get('?tree_id=abc&gender=M');
    expect(res.status).toBe(200);
    expect(mockMembersService.getAllMembers).toHaveBeenLastCalledWith(1, 10, undefined, undefined, undefined, undefined, 'full', 'abc', 'M');
  });
});

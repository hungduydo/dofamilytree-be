import { Test, TestingModule } from '@nestjs/testing';
import { RolesGuard } from '../../src/auth/roles.guard';
import { CallerMetaGuard } from '../../src/auth/caller-meta.guard';
import { MembersController } from '../../src/members/members.controller';
import { MembersService } from '../../src/members/members.service';

const mockMembersService = {
  getAllMembers: jest.fn(),
  searchMembers: jest.fn(),
  getMemberById: jest.fn(),
  createMember: jest.fn(),
  getMemberProfile: jest.fn(),
  updateMemberProfile: jest.fn(),
  deleteMember: jest.fn(),
  recomputeGenerations: jest.fn(),
};

describe('MembersController', () => {
  let controller: MembersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MembersController],
      providers: [{ provide: MembersService, useValue: mockMembersService }],
    })
      // Guard cần PrismaService; spec này chỉ kiểm tra controller uỷ quyền đúng
      // cho service. Phân quyền route được khoá ở test/auth/route-roles.spec.ts.
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CallerMetaGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<MembersController>(MembersController);
    jest.clearAllMocks();
  });

  it('GET /members should call getAllMembers with page and pageSize', async () => {
    mockMembersService.getAllMembers.mockResolvedValue({ data: [], total: 0 });
    await controller.getAllMembers(1, 10, undefined);
    expect(mockMembersService.getAllMembers).toHaveBeenCalledWith(
      1, 10, undefined, undefined, undefined, undefined, 'full', undefined, undefined, undefined,
    );
  });

  it('GET /members should pass the name filter through for table search', async () => {
    mockMembersService.getAllMembers.mockResolvedValue({ data: [], total: 0 });
    await controller.getAllMembers(1, 10, 'nguyen');
    expect(mockMembersService.getAllMembers).toHaveBeenCalledWith(
      1, 10, 'nguyen', undefined, undefined, undefined, 'full', undefined, undefined, undefined,
    );
  });

  it('GET /members truyền generation + sortBy + sortOrder đúng thứ tự', async () => {
    mockMembersService.getAllMembers.mockResolvedValue({ data: [], total: 0 });
    await controller.getAllMembers(1, 10, undefined, 3, 'generation', 'asc');
    expect(mockMembersService.getAllMembers).toHaveBeenCalledWith(
      1, 10, undefined, 3, 'generation', 'asc', 'full', undefined, undefined, undefined,
    );
  });

  it('POST /members/generations/recompute uỷ quyền cho service (admin gác ở guard)', async () => {
    mockMembersService.recomputeGenerations.mockResolvedValue({ members: 5, updated: 5 });
    await controller.recomputeGenerations();
    expect(mockMembersService.recomputeGenerations).toHaveBeenCalledWith();
  });

  it('GET /members/search should call searchMembers with name query', async () => {
    mockMembersService.searchMembers.mockResolvedValue([]);
    await controller.searchMembers('nguyen');
    expect(mockMembersService.searchMembers).toHaveBeenCalledWith('nguyen');
  });

  it('GET /members/:id should call getMemberById', async () => {
    mockMembersService.getMemberById.mockResolvedValue({ id: 'uuid-1' });
    await controller.getMemberById('uuid-1', false);
    expect(mockMembersService.getMemberById).toHaveBeenCalledWith('uuid-1', false);
  });

  it('POST /members should call createMember with DTO', async () => {
    mockMembersService.createMember.mockResolvedValue({ id: 'uuid-new' });
    const dto = { fullName: 'Test', gender: 'M' };
    await controller.createMember(dto as any);
    expect(mockMembersService.createMember).toHaveBeenCalledWith(dto);
  });

  it('PUT /members/:id/profile should call updateMemberProfile', async () => {
    mockMembersService.updateMemberProfile.mockResolvedValue({ id: 'uuid-1' });
    const caller = { roles: ['editor'], profileMemberId: null };
    await controller.updateMemberProfile('uuid-1', { fullName: 'Updated', gender: 'M' } as any, caller, undefined);
    expect(mockMembersService.updateMemberProfile).toHaveBeenCalledWith(
      'uuid-1', expect.any(Object), undefined, caller,
    );
  });

  it('DELETE /members/:id should call deleteMember', async () => {
    mockMembersService.deleteMember.mockResolvedValue(undefined);
    await controller.deleteMember('uuid-1');
    expect(mockMembersService.deleteMember).toHaveBeenCalledWith('uuid-1');
  });
});

import { Test, TestingModule } from '@nestjs/testing';
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
};

describe('MembersController', () => {
  let controller: MembersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MembersController],
      providers: [{ provide: MembersService, useValue: mockMembersService }],
    }).compile();

    controller = module.get<MembersController>(MembersController);
    jest.clearAllMocks();
  });

  it('GET /members should call getAllMembers with page and pageSize', async () => {
    mockMembersService.getAllMembers.mockResolvedValue({ data: [], total: 0 });
    await controller.getAllMembers(1, 10);
    expect(mockMembersService.getAllMembers).toHaveBeenCalledWith(1, 10);
  });

  it('GET /members/search should call searchMembers with name query', async () => {
    mockMembersService.searchMembers.mockResolvedValue([]);
    await controller.searchMembers('nguyen');
    expect(mockMembersService.searchMembers).toHaveBeenCalledWith('nguyen');
  });

  it('GET /members/:id should call getMemberById', async () => {
    mockMembersService.getMemberById.mockResolvedValue({ id: 'uuid-1' });
    await controller.getMemberById('uuid-1');
    expect(mockMembersService.getMemberById).toHaveBeenCalledWith('uuid-1');
  });

  it('POST /members should call createMember with DTO', async () => {
    mockMembersService.createMember.mockResolvedValue({ id: 'uuid-new' });
    const dto = { fullName: 'Test', gender: 'M' };
    await controller.createMember(dto as any);
    expect(mockMembersService.createMember).toHaveBeenCalledWith(dto);
  });

  it('PUT /members/:id/profile should call updateMemberProfile', async () => {
    mockMembersService.updateMemberProfile.mockResolvedValue({ id: 'uuid-1' });
    await controller.updateMemberProfile('uuid-1', { fullName: 'Updated', gender: 'M' } as any, undefined);
    expect(mockMembersService.updateMemberProfile).toHaveBeenCalledWith('uuid-1', expect.any(Object), undefined);
  });

  it('DELETE /members/:id should call deleteMember', async () => {
    mockMembersService.deleteMember.mockResolvedValue(undefined);
    await controller.deleteMember('uuid-1');
    expect(mockMembersService.deleteMember).toHaveBeenCalledWith('uuid-1');
  });
});

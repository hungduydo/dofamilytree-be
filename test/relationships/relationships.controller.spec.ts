import { Test, TestingModule } from '@nestjs/testing';
import { RelationshipsController } from '../../src/relationships/relationships.controller';
import { RelationshipsService } from '../../src/relationships/relationships.service';

const mockRelationshipsService = {
  getRelationships: jest.fn(),
  getParents: jest.fn(),
  getChildren: jest.fn(),
  getSpouses: jest.fn(),
  getAncestors: jest.fn(),
  getDescendants: jest.fn(),
  searchRelationships: jest.fn(),
  addRelationship: jest.fn(),
  deleteRelationship: jest.fn(),
};

describe('RelationshipsController', () => {
  let controller: RelationshipsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RelationshipsController],
      providers: [{ provide: RelationshipsService, useValue: mockRelationshipsService }],
    }).compile();

    controller = module.get<RelationshipsController>(RelationshipsController);
    jest.clearAllMocks();
  });

  it('GET /members/:id/relationships should call getRelationships', async () => {
    mockRelationshipsService.getRelationships.mockResolvedValue([]);
    await controller.getRelationships('member-1');
    expect(mockRelationshipsService.getRelationships).toHaveBeenCalledWith('member-1');
  });

  it('GET /members/:id/relationships/parents should call getParents', async () => {
    mockRelationshipsService.getParents.mockResolvedValue([]);
    await controller.getParents('member-1');
    expect(mockRelationshipsService.getParents).toHaveBeenCalledWith('member-1');
  });

  it('GET /members/:id/relationships/children should call getChildren', async () => {
    mockRelationshipsService.getChildren.mockResolvedValue([]);
    await controller.getChildren('member-1');
    expect(mockRelationshipsService.getChildren).toHaveBeenCalledWith('member-1');
  });

  it('GET /members/:id/relationships/spouses should call getSpouses', async () => {
    mockRelationshipsService.getSpouses.mockResolvedValue([]);
    await controller.getSpouses('member-1');
    expect(mockRelationshipsService.getSpouses).toHaveBeenCalledWith('member-1');
  });

  it('GET /members/:id/relationships/ancestors should call getAncestors', async () => {
    mockRelationshipsService.getAncestors.mockResolvedValue([]);
    await controller.getAncestors('member-1');
    expect(mockRelationshipsService.getAncestors).toHaveBeenCalledWith('member-1');
  });

  it('GET /members/:id/relationships/descendants should call getDescendants', async () => {
    mockRelationshipsService.getDescendants.mockResolvedValue([]);
    await controller.getDescendants('member-1');
    expect(mockRelationshipsService.getDescendants).toHaveBeenCalledWith('member-1');
  });

  it('GET /relationships/search should call searchRelationships', async () => {
    mockRelationshipsService.searchRelationships.mockResolvedValue([]);
    await controller.searchRelationships({ type: 'BIOLOGICAL' } as any);
    expect(mockRelationshipsService.searchRelationships).toHaveBeenCalledWith({ type: 'BIOLOGICAL' });
  });

  it('POST /members/:id/relationships should call addRelationship', async () => {
    mockRelationshipsService.addRelationship.mockResolvedValue({ id: 'rel-1' });
    const dto = { parentId: 'parent-1', childId: 'child-1', type: 'BIOLOGICAL' as const };
    await controller.addRelationship(dto as any);
    expect(mockRelationshipsService.addRelationship).toHaveBeenCalledWith(dto);
  });

  it('DELETE /relationships/:id should call deleteRelationship', async () => {
    mockRelationshipsService.deleteRelationship.mockResolvedValue(undefined);
    await controller.deleteRelationship('rel-1');
    expect(mockRelationshipsService.deleteRelationship).toHaveBeenCalledWith('rel-1');
  });
});

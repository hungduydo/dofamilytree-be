import { Test, TestingModule } from '@nestjs/testing';
import { TreeController } from '../../src/tree/tree.controller';
import { TreeService } from '../../src/tree/tree.service';

const mockTreeService = {
  getFamilyTreeChart: jest.fn(),
  getFamilySubTreeChart: jest.fn(),
  regenerateFamilyTreeChart: jest.fn(),
  getStats: jest.fn(),
  getAllTrees: jest.fn(),
  getHomeTrees: jest.fn(),
  getTreeById: jest.fn(),
  createTree: jest.fn(),
  updateTree: jest.fn(),
  deleteTree: jest.fn(),
};

describe('TreeController', () => {
  let controller: TreeController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TreeController],
      providers: [{ provide: TreeService, useValue: mockTreeService }],
    }).compile();

    controller = module.get<TreeController>(TreeController);
    jest.clearAllMocks();
  });

  it('GET /tree/chart should call getFamilyTreeChart', async () => {
    mockTreeService.getFamilyTreeChart.mockResolvedValue({ nodes: [], generatedAt: new Date().toISOString() });
    await controller.getChart();
    expect(mockTreeService.getFamilyTreeChart).toHaveBeenCalled();
  });

  it('GET /tree/chart/:memberId should call getFamilySubTreeChart', async () => {
    mockTreeService.getFamilySubTreeChart.mockResolvedValue({ nodes: [] });
    await controller.getSubTreeChart('member-1');
    expect(mockTreeService.getFamilySubTreeChart).toHaveBeenCalledWith('member-1');
  });

  it('POST /tree/regenerate should call regenerateFamilyTreeChart', async () => {
    mockTreeService.regenerateFamilyTreeChart.mockResolvedValue({ nodes: [], generatedAt: new Date().toISOString() });
    await controller.regenerate();
    expect(mockTreeService.regenerateFamilyTreeChart).toHaveBeenCalled();
  });

  it('GET /tree/stats should call getStats', async () => {
    mockTreeService.getStats.mockResolvedValue({ totalMembers: 10, totalGenerations: 3 });
    await controller.getStats();
    expect(mockTreeService.getStats).toHaveBeenCalled();
  });

  it('GET /tree should call getAllTrees', async () => {
    mockTreeService.getAllTrees.mockResolvedValue([]);
    await controller.getAllTrees();
    expect(mockTreeService.getAllTrees).toHaveBeenCalled();
  });

  it('GET /tree/home should call getHomeTrees', async () => {
    mockTreeService.getHomeTrees.mockResolvedValue([]);
    await controller.getHomeTrees();
    expect(mockTreeService.getHomeTrees).toHaveBeenCalled();
  });

  it('POST /tree should call createTree', async () => {
    mockTreeService.createTree.mockResolvedValue({ id: 't1' });
    await controller.createTree({ title: 'Test', show: false, owner_id: 'u1' } as any);
    expect(mockTreeService.createTree).toHaveBeenCalled();
  });

  it('PUT /tree/:id should call updateTree', async () => {
    mockTreeService.updateTree.mockResolvedValue({ id: 't1', title: 'Updated' });
    await controller.updateTree('t1', { title: 'Updated' } as any);
    expect(mockTreeService.updateTree).toHaveBeenCalledWith('t1', expect.any(Object));
  });

  it('DELETE /tree/:id should call deleteTree', async () => {
    mockTreeService.deleteTree.mockResolvedValue(undefined);
    await controller.deleteTree('t1');
    expect(mockTreeService.deleteTree).toHaveBeenCalledWith('t1');
  });
});

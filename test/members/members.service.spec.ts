import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { MembersService } from '../../src/members/members.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { QStashService } from '../../src/queue/qstash.service';
import { QUEUE_AVATAR_UPLOAD, QUEUE_REPORT_GENERATE, QUEUE_NOTIFICATION } from '../../src/queue/queue.constants';

const mockPrisma = {
  member: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  profile: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  userMetadata: {
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockQStashService = { publish: jest.fn().mockResolvedValue({}) };

describe('MembersService', () => {
  let service: MembersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MembersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: QStashService, useValue: mockQStashService },
      ],
    }).compile();

    service = module.get<MembersService>(MembersService);
    jest.clearAllMocks();
  });

  describe('createMember', () => {
    it('should create member + profile successfully', async () => {
      const dto = { fullName: 'Nguyễn Văn A', gender: 'M', birthDate: '1990-01-01' };
      mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
      mockPrisma.member.create.mockResolvedValue({ id: 'uuid-1', name: 'Nguyễn Văn A', gender: 'M' });
      mockPrisma.profile.create.mockResolvedValue({ id: 'p-1', fullName: 'Nguyễn Văn A' });

      const result = await service.createMember(dto);
      expect(result).toHaveProperty('id', 'uuid-1');
      expect(mockPrisma.member.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ name: 'Nguyễn Văn A' }) }),
      );
    });

    it('should throw BadRequestException when name is missing', async () => {
      await expect(service.createMember({ fullName: '', gender: 'M' })).rejects.toThrow(BadRequestException);
    });

    it('should queue notification after create', async () => {
      const dto = { fullName: 'Test Member', gender: 'F' };
      mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
      mockPrisma.member.create.mockResolvedValue({ id: 'uuid-2', name: 'Test Member' });
      mockPrisma.profile.create.mockResolvedValue({ id: 'p-2', fullName: 'Test Member' });

      await service.createMember(dto);
      expect(mockQStashService.publish).toHaveBeenCalledWith(
        QUEUE_NOTIFICATION,
        expect.objectContaining({ type: 'NEW_MEMBER' }),
      );
    });

    it('should queue report regeneration after create', async () => {
      const dto = { fullName: 'New Member', gender: 'M' };
      mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
      mockPrisma.member.create.mockResolvedValue({ id: 'uuid-3', name: 'New Member' });
      mockPrisma.profile.create.mockResolvedValue({ id: 'p-3', fullName: 'New Member' });

      await service.createMember(dto);
      expect(mockQStashService.publish).toHaveBeenCalledWith(QUEUE_REPORT_GENERATE, {});
    });
  });

  describe('getMemberById', () => {
    it('should return member with profile when found', async () => {
      mockPrisma.member.findUnique.mockResolvedValue({
        id: 'uuid-1',
        name: 'Test',
        profile: { fullName: 'Test', generation: 3 },
      });

      const result = await service.getMemberById('uuid-1');
      expect(result).toHaveProperty('id', 'uuid-1');
    });

    it('should throw NotFoundException when member not found', async () => {
      mockPrisma.member.findUnique.mockResolvedValue(null);
      await expect(service.getMemberById('not-exist')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAllMembers', () => {
    it('should return paginated list', async () => {
      mockPrisma.member.findMany.mockResolvedValue([{ id: '1', name: 'A' }, { id: '2', name: 'B' }]);
      mockPrisma.member.count.mockResolvedValue(2);

      const result = await service.getAllMembers(1, 10);
      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should use default page=1 pageSize=10', async () => {
      mockPrisma.member.findMany.mockResolvedValue([]);
      mockPrisma.member.count.mockResolvedValue(0);

      await service.getAllMembers(undefined, undefined);
      expect(mockPrisma.member.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );
    });
  });

  describe('searchMembers', () => {
    it('should search by normalized name (Vietnamese-insensitive)', async () => {
      mockPrisma.member.findMany.mockResolvedValue([{ id: '1', name: 'Nguyễn Văn A' }]);

      const result = await service.searchMembers('nguyen van a');
      expect(mockPrisma.member.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({
                normalized_name: expect.objectContaining({ contains: 'nguyen van a' }),
              }),
              expect.objectContaining({
                name: expect.objectContaining({ contains: 'nguyen van a' }),
              }),
            ]),
          }),
        }),
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('updateMemberProfile', () => {
    it('should update member and profile', async () => {
      mockPrisma.member.findUnique.mockResolvedValue({ id: 'uuid-1', profile: { id: 'p-1' } });
      mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
      mockPrisma.member.update.mockResolvedValue({ id: 'uuid-1', name: 'Updated' });
      mockPrisma.profile.update.mockResolvedValue({ id: 'p-1', fullName: 'Updated' });

      const result = await service.updateMemberProfile('uuid-1', { fullName: 'Updated', gender: 'M' });
      expect(result).toHaveProperty('id', 'uuid-1');
    });

    it('should throw NotFoundException when member not found', async () => {
      mockPrisma.member.findUnique.mockResolvedValue(null);
      await expect(service.updateMemberProfile('bad-id', { fullName: 'X', gender: 'M' })).rejects.toThrow(NotFoundException);
    });

    it('should queue avatar upload when file is provided', async () => {
      mockPrisma.member.findUnique.mockResolvedValue({ id: 'uuid-1', profile: { id: 'p-1' } });
      mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
      mockPrisma.member.update.mockResolvedValue({ id: 'uuid-1' });
      mockPrisma.profile.update.mockResolvedValue({ id: 'p-1' });

      const mockFile = { buffer: Buffer.from('img'), originalname: 'avatar.jpg', mimetype: 'image/jpeg' } as Express.Multer.File;
      await service.updateMemberProfile('uuid-1', { fullName: 'X', gender: 'M' }, mockFile);
      expect(mockQStashService.publish).toHaveBeenCalledWith(
        QUEUE_AVATAR_UPLOAD,
        expect.objectContaining({ memberId: 'uuid-1' }),
      );
    });
  });

  describe('deleteMember', () => {
    it('should cascade delete profile and userMetadata before member and queue report', async () => {
      mockPrisma.member.findUnique.mockResolvedValue({ id: 'uuid-1' });
      mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
      mockPrisma.profile.delete.mockResolvedValue({});
      mockPrisma.userMetadata.deleteMany.mockResolvedValue({});
      mockPrisma.member.delete.mockResolvedValue({ id: 'uuid-1' });

      await service.deleteMember('uuid-1');
      expect(mockPrisma.member.delete).toHaveBeenCalledWith({ where: { id: 'uuid-1' } });
      expect(mockQStashService.publish).toHaveBeenCalledWith(QUEUE_REPORT_GENERATE, {});
    });

    it('should throw NotFoundException when member not found', async () => {
      mockPrisma.member.findUnique.mockResolvedValue(null);
      await expect(service.deleteMember('bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});

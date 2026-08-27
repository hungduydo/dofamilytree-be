import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../src/auth/roles.decorator';
import { IS_PUBLIC_KEY } from '../../src/auth/public.decorator';
import { AuthController } from '../../src/auth/auth.controller';
import { MembersController } from '../../src/members/members.controller';
import { RelationshipsController } from '../../src/relationships/relationships.controller';
import { TreeController } from '../../src/tree/tree.controller';
import { ReportController } from '../../src/tree/report.controller';
import { EventsController } from '../../src/events/events.controller';
import { AnniversariesController } from '../../src/events/anniversaries.controller';
import { GravesController } from '../../src/graves/graves.controller';
import { ArticlesController } from '../../src/articles/articles.controller';
import { LifeEventsController } from '../../src/life-events/life-events.controller';
import { MemoriesController } from '../../src/memories/memories.controller';
import { MediaController } from '../../src/media/media.controller';
import { QueueController } from '../../src/queue/queue.controller';

/**
 * Lưới an toàn CƠ HỌC cho bảng phân quyền.
 *
 * Trước đợt này chỉ 2 route trong toàn bộ app có @Roles — mọi tài khoản đã đăng
 * nhập đều xoá được bất kỳ member nào. Spec này khoá lại toàn bộ bảng: thêm một
 * route mới mà quên gắn @Roles sẽ làm test đỏ chứ không âm thầm mở cửa.
 *
 * 'public' = @Public() (không cần token). 'open' = AuthController không gắn
 * guard cấp class nên route không có guard nào — chỉ đúng cho register/login.
 * 'auth' = đã đăng nhập, không @Roles (guest vào được). Còn lại là role TỐI
 * THIỂU — RolesGuard hiểu theo nghĩa "trở lên", nên 'editor' bao gồm cả admin.
 */
type Expectation = 'public' | 'open' | 'auth' | 'member' | 'editor' | 'admin';

const reflector = new Reflector();

const TABLE: Array<[string, any, Record<string, Expectation>]> = [
  ['AuthController', AuthController, {
    register: 'open', login: 'open',
    logout: 'auth', changePassword: 'auth', getMe: 'auth', getRoles: 'auth',
    listUsers: 'admin', assignRoles: 'admin', linkMember: 'admin', unlinkMember: 'admin',
  }],
  ['MembersController', MembersController, {
    getCommitteeMembers: 'public', getNotableMembers: 'public', getMemberStats: 'public',
    getAllMembers: 'auth', searchMembers: 'auth', getMemberById: 'auth', getMemberProfile: 'auth',
    createMember: 'editor',
    // 'member' ở đây chỉ là cửa vào — ràng buộc "chính chủ + allowlist field"
    // nằm trong MembersService.assertCanEditMember (members.self-edit.spec.ts).
    updateMemberProfile: 'member',
    deleteMember: 'admin', recomputeGenerations: 'admin',
  }],
  ['RelationshipsController', RelationshipsController, {
    getRelationships: 'auth', getParents: 'auth', getChildren: 'auth', getSpouses: 'auth',
    getAncestors: 'auth', getDescendants: 'auth', searchRelationships: 'auth',
    addRelationship: 'editor', deleteRelationship: 'admin',
  }],
  ['TreeController', TreeController, {
    getChart: 'public', getSubTreeChart: 'public', getHomeTrees: 'public',
    getStats: 'auth', getAllTrees: 'auth', getTreeById: 'auth',
    regenerate: 'editor', createTree: 'editor', updateTree: 'editor', deleteTree: 'admin',
  }],
  ['ReportController', ReportController, { getCachedReport: 'auth' }],
  ['EventsController', EventsController, {
    getGallery: 'public', getEvents: 'public', getById: 'public',
    getAttendees: 'auth',
    create: 'editor', update: 'editor', addAttendee: 'editor', removeAttendee: 'editor',
    delete: 'admin',
  }],
  ['AnniversariesController', AnniversariesController, {
    getAnniversaries: 'auth', getUpcoming: 'auth', getById: 'auth',
    create: 'editor', update: 'editor', delete: 'admin',
  }],
  ['GravesController', GravesController, {
    getAllGraves: 'public', getNearbyGraves: 'public', getGraveById: 'public',
    createGrave: 'editor', updateGrave: 'editor', deleteGrave: 'admin',
  }],
  ['ArticlesController', ArticlesController, {
    getArticles: 'public', getById: 'public', incrementView: 'public',
    create: 'editor', update: 'editor', delete: 'admin',
  }],
  ['LifeEventsController', LifeEventsController, {
    getByMember: 'public', create: 'editor', delete: 'admin',
  }],
  ['MemoriesController', MemoriesController, {
    getByMember: 'public', create: 'member', delete: 'admin',
  }],
  ['MediaController', MediaController, {
    getMedia: 'public', getMediaStats: 'public', getAlbums: 'public', incrementViews: 'public',
    getMemberMedia: 'auth',
    uploadMedia: 'member', createUploadUrl: 'member', completeUpload: 'member', getUploadProgress: 'member',
    createAlbum: 'editor',
    getBlobStorageUsage: 'admin', deleteMedia: 'admin', deleteAlbum: 'admin',
  }],
  // Người gọi là QStash, danh tính chứng minh bằng chữ ký chứ không phải token.
  ['QueueController', QueueController, { handleCallback: 'public' }],
];

describe('Bảng phân quyền theo route', () => {
  describe.each(TABLE)('%s', (_name, controller, expectations) => {
    const handlerNames = Object.getOwnPropertyNames(controller.prototype).filter(
      (key) => key !== 'constructor' && typeof controller.prototype[key] === 'function',
    );

    it('spec này phủ ĐÚNG mọi handler của controller', () => {
      expect(handlerNames.sort()).toEqual(Object.keys(expectations).sort());
    });

    it.each(Object.entries(expectations))('%s → %s', (handlerName, expected) => {
      const handler = controller.prototype[handlerName];
      const isPublic = reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [handler, controller]);
      const roles = reflector.getAllAndOverride<string[]>(ROLES_KEY, [handler, controller]);

      if (expected === 'public') {
        expect(isPublic).toBe(true);
        return;
      }
      if (expected === 'open') {
        expect(roles).toBeUndefined();
        return;
      }
      expect(isPublic).toBeFalsy();

      if (expected === 'auth') {
        expect(roles).toBeUndefined();
        return;
      }
      expect(roles).toEqual([expected]);
    });
  });
});

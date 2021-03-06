const Router = require('koa-router');
const Module = require('../models/module');
const permController = require('../middleware/permController');
const { userPermissions } = require('../middleware/_helpers/roles');
const { validateModules } = require('../middleware/validation/validatePostData');
const { anonymousUser, returnType, insertType, permissionsType } = require('../utils/userProgress/moduleRouteUtils');

const environment = process.env.NODE_ENV;
const config = require('../knexfile.js')[environment];
const knex = require('knex')(config);

const slugGen = require('../utils/slugGen');

const router = new Router({
  prefix: '/modules'
});



/**
 * @api {get} /modules/:id GET single module.
 * @apiName GetAModule
 * @apiGroup Modules
 * @apiPermission none
 * @apiVersion 0.4.0
 *
 * @apiSampleRequest off
 *
 * @apiSuccessExample {json} Success-Response:
 *     HTTP/1.1 200 OK
 *     { "modules": {
 *         "id": "module1",
 *         "name": "A Module",
 *         "slug": "a-module-1",
 *         "description": "Contains Lessons.",
 *         "status": "published",
 *         "creatorId": "user1",
 *         "createdAt": "2017-12-20T16:17:10.000Z",
 *         "updatedAt": "2017-12-20T16:17:10.000Z",
 *         "lessons": [
 *             {
 *                 "id": "lesson1",
 *                 "name": "A Lesson",
 *                 "type": "lessons"
 *             }
 *         ],
 *         "progress": 0,
 *         "permissions": {
 *             "read": "true",
 *             "update": "true",
 *             "create": "true",
 *             "delete": "true"
 *         }
 *       }
 *     }
 *
 * @apiError {String} errors Bad Request.
 */
router.get('/:id', permController.requireAuth, async ctx => {
  const modules = await Module.query().findById(ctx.params.id).eager('lessons(selectNameAndId)');
  ctx.assert(modules, 404, 'No matching record found');

  await anonymousUser(modules, ctx.state.user.data.id);
  returnType(modules);

  async function permObjects() {
    Object.keys(userPermissions)
      .forEach(perm => {
        if (!ctx.state.user) {
          userPermissions.read = 'true';
          userPermissions.update = 'false';
          userPermissions.delete = 'false';
          userPermissions.create = 'false';
        } else if (ctx.state.user.data.role.toLowerCase() == 'superadmin') {
          userPermissions[perm] = 'true';
        } else if (ctx.state.user.data.role.toLowerCase() == 'admin' && ctx.state.user.data.id != modules.creatorId) {
          userPermissions[perm] = 'true';
          userPermissions.update = 'false';
          userPermissions.create = 'false';
          userPermissions.delete = 'false';
        } else if (ctx.state.user.data.id === modules.creatorId || ctx.state.user.data.role.toLowerCase() == 'admin') {
          userPermissions[perm] = 'true';
          userPermissions.delete = 'false';
        } else if (modules.status === 'draft' && ctx.state.user.data.id === modules.creatorId) {
          userPermissions.read = 'true';
          userPermissions.update = 'true';
        } else {
          userPermissions.read = 'true';
          userPermissions.update = 'false';
          userPermissions.delete = 'false';
          userPermissions.create = 'false';
        }
      });
    return modules.permissions = userPermissions;
  }

  ctx.status = 200;
  modules['permissions'] = await permObjects();
  ctx.body = { modules };
});



/**
 * @api {get} /modules/ GET all modules.
 * @apiName GetModules
 * @apiGroup Modules
 * @apiPermission none
 *
 * @apiSampleRequest off
 *
 * @apiSuccessExample {json} Success-Response:
 *     HTTP/1.1 200 OK
 *     "modules": [{
 *        "id": "module1",
 *        "name": "A Module",
 *        "slug": "a-module-1",
 *        "description": "Contains Lessons.",
 *        "status": "published",
 *        "creatorId": "user1",
 *        "createdAt": "2017-12-20T16:17:10.000Z",
 *        "updatedAt": "2017-12-20T16:17:10.000Z",
 *        "lessons": [
 *            {
 *                "id": "lesson1",
 *                "name": "A Lesson",
 *                "type": "lessons"
 *            }
 *        ],
 *        "progress": 0,
 *        "permission": {
 *            "read": "true",
 *            "update": "false",
 *            "create": "false",
 *            "delete": "false"
 *        }
 *    }]
 * @apiError {String} errors Bad Request.
 */

router.get('/', permController.requireAuth, async ctx => {
  try {
    const modules = await Module.query().where(ctx.query).eager('lessons(selectNameAndId)');

    await anonymousUser(modules, ctx.state.user.data.id);
    returnType(modules);

    modules.forEach(child => {
      Object.keys(userPermissions)
        .forEach(perm => {
          if (!ctx.state.user) {
            userPermissions.read = 'true';
            userPermissions.update = 'false';
            userPermissions.delete = 'false';
            userPermissions.create = 'false';
          } else if (ctx.state.user.data.role.toLowerCase() == 'superadmin') {
            userPermissions[perm] = 'true';
          } else if (ctx.state.user.data.id === child.creatorId || ctx.state.user.data.role.toLowerCase() == 'admin') {
            userPermissions[perm] = 'true';
            userPermissions.delete = 'false';
          } else if (ctx.state.user.data.id != child.creatorId) {
            userPermissions.read = 'true';
            userPermissions.update = 'false';
            userPermissions.create = 'false';
            userPermissions.delete = 'false';
          } else if (child.status === 'draft' && ctx.state.user.data.id === child.creatorId) {
            userPermissions.read = 'true';
            userPermissions.update = 'true';
          }
          child.permission = userPermissions;
        });
    });

    ctx.status = 200;
    modules['permissions'] = await permissionsType(ctx.state.user, modules);
    ctx.body = { modules };


  } catch (e) {
    if (e.statusCode) {
      ctx.throw(e.statusCode, { message: 'The query key does not exist' });
      ctx.throw(e.statusCode, null, { errors: ['bad Request'] });
    } else { ctx.throw(400, null, { errors: ['bad Request'] }); }
    throw e;
  }

});


/**
 * @api {post} /modules POST a module.
 * @apiName PostAModule
 * @apiGroup Modules
 * @apiPermission none
 *
 * @apiParam {String} module[name] Name - Unique.
 * @apiParam {String} module[slug] Slug - Unique and autogenerated.
 * @apiParam {String} module[description] Description.
 * @apiParam {String} module[status] modules status - published | draft .
 * @apiParam {String} module[creatorId] Id of the User.
 *
 * @apiSampleRequest off
 *
 * @apiSuccessExample {json} Success-Response:
 *     HTTP/1.1 201 OK
 *     {
 *      "module": {
 *        "name": "module",
 *        "slug": "a-module",
 *        "description": "this is a module.",
 *        "status": "published",
 *        "creatorId": "user1",
 *      }
 *    }
 *
 * @apiError {String} errors Bad Request.
 *
 */

router.post('/', permController.requireAuth, permController.grantAccess('createAny', 'path'), validateModules, async ctx => {

  let newModule = ctx.request.body.module;
  newModule.slug = await slugGen(newModule.name);
  
  let modules;
  try {
    modules = await Module.query().insertAndFetch(newModule);
  } catch (e) {
    if (e.statusCode) {
      ctx.throw(e.statusCode, null, { errors: [e.message] });
    } else { ctx.throw(400, null, { errors: ['Bad Request'] }); }
    throw e;
  }

  async function permObjects() {
    Object.keys(userPermissions)
      .forEach(perm => {
        if (ctx.state.user.data.role.toLowerCase() == 'superadmin') {
          userPermissions[perm] = 'true';
        } else if (ctx.state.user.data.id === modules.creatorId || ctx.state.user.data.role.toLowerCase() == 'admin') {
          userPermissions[perm] = 'true';
          userPermissions.delete = 'false';
        } else if (modules.status === 'draft' && ctx.state.user.data.id === modules.creatorId) {
          userPermissions.read = 'true';
          userPermissions.update = 'true';
        } else {
          userPermissions.read = 'true';
        }
      });
    return modules.permissions = userPermissions;
  }

  ctx.status = 201;
  modules['permissions'] = await permObjects();
  ctx.body = { modules };

});

/**
 * @api {put} /modules/:id PUT a module.
 * @apiName PutAModule
 * @apiGroup Modules
 * @apiPermission [admin, teacher, superadmin]
 *
 * @apiParam {String} module[name] Optional Name Unique.
 * @apiParam {String} module[slug] Optional Slug is Unique and autogenerated.
 * @apiParam {String} module[description] Optional Description.
 * @apiParam {String} module[status] modules status[published or draft]
 *
 *
 * @apiSampleRequest off
 *
 * @apiSuccess {String} module[object] Object data
 * @apiError {String} errors Bad Request.
 */
router.put('/:id', permController.requireAuth, permController.grantAccess('createAny', 'path'), async ctx => {
  let { lessons, ...newModule } = ctx.request.body.module;

  let modules;
  try {
    await Module.query().findById(ctx.params.id);
    modules = await Module.query().patchAndFetchById(ctx.params.id, newModule);
  } catch (e) {
    if (e.statusCode) {
      ctx.throw(e.statusCode, null, { errors: [e.message] });
    } else { ctx.throw(401, null, { errors: ['Bad Request'] }); }
    throw e;
  }

  await knex('module_lessons').where({ 'module_id': modules.id }).del();
  await insertType('module_lessons', lessons, modules.id);


  async function permObjects() {
    Object.keys(userPermissions)
      .forEach(perm => {
        if (ctx.state.user.data.role.toLowerCase() == 'superadmin') {
          userPermissions[perm] = 'true';
        } else if (ctx.state.user.data.id === modules.creatorId || ctx.state.user.data.role.toLowerCase() == 'admin') {
          userPermissions[perm] = 'true';
          userPermissions.delete = 'false';
        } else if (modules.status === 'draft' && ctx.state.user.data.id === modules.creatorId) {
          userPermissions.read = 'true';
          userPermissions.update = 'true';
        }
      });
    return modules.permissions = userPermissions;
  }

  ctx.status = 201;
  modules['permissions'] = await permObjects();
  ctx.body = { modules };
});

/**
 * @api {delete} /modules/:id DELETE a module.
 * @apiName DeleteAModule
 * @apiGroup Modules
 * @apiPermission [admin, superadmin]
 *
 * @apiSuccess {String} module[object] Object data
 * @apiError {String} errors Bad Request.
 *
 */


router.delete('/:id', permController.requireAuth, permController.grantAccess('deleteOwn', 'path'), async ctx => {
  let modules = await Module.query().findById(ctx.params.id);

  if (modules === undefined) {
    ctx.throw(400, null, { errors: ['Bad Request'] });
  }

  await Module.query().delete().where({ id: ctx.params.id });

  ctx.status = 200;
  ctx.body = { modules };
});

module.exports = router.routes();
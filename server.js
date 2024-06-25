import bodyParser from "body-parser";
import "dotenv/config";
import express from "express";
import path from "path";

import {
  bryntumDepTypeToServiceNowDepType,
  bryntumDependencyFieldsToServiceNowFields,
  bryntumGanttDepLagToServiceNowDepLag,
  bryntumTaskFieldsToServiceNowFields,
  calcStartDate,
  calculateDuration,
  formatDateServiceNow,
  serviceNowDepLagToBryntumDepLag,
  serviceNowDepTypeToBryntumDepType,
} from "./utils.js";

global.__dirname = path.resolve();

const port = process.env.PORT || 1337;
const app = express();

app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(path.join(__dirname, "/node_modules/@bryntum/gantt")));

app.use(bodyParser.json());

app.get("/api/load", async (req, res) => {
  try {
    const projectResponse = await fetch(
      `https://${process.env.SERVICENOW_PDI_ID}.service-now.com/api/now/table/pm_project?sysparm_fields=sys_id,short_description,start_date,end_date,wbs_order,percent_complete,description,status,override_status&sys_id=${process.env.SERVICENOW_PROJECT_SYS_ID}`,
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization:
            "Basic " +
            btoa(
              `${process.env.SERVICENOW_USERNAME}:${process.env.SERVICENOW_PASSWORD}`
            ),
        },
      }
    );
    const projectResult = await projectResponse.json();

    const tasksResponse = await fetch(
      `https://${process.env.SERVICENOW_PDI_ID}.service-now.com/api/now/table/pm_project_task?sysparm_fields=relation_applied,relation_applied.parent,relation_applied.lag,relation_applied.sub_type,sys_id,short_description,parent,project,start_date,end_date,wbs_order,percent_complete,description,status,override_status&sub_tree_root=${process.env.SERVICENOW_PROJECT_SYS_ID}`,
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization:
            "Basic " +
            btoa(
              `${process.env.SERVICENOW_USERNAME}:${process.env.SERVICENOW_PASSWORD}`
            ),
        },
      }
    );

    const tasksResult = await tasksResponse.json();

    let dependencies = [];

    const tasks = tasksResult?.result.map((task) => {
      // add dependencies
      if (task.relation_applied) {
        // calculate lag and lagUnit
        const { lag, lagUnit } = serviceNowDepLagToBryntumDepLag(
          task["relation_applied.lag"]
        );

        dependencies.push({
          id: task.relation_applied.value,
          from: task["relation_applied.parent"].value,
          to: task.sys_id,
          // map to Bryntum Gantt dependency type
          type: serviceNowDepTypeToBryntumDepType(
            task["relation_applied.sub_type"]
          ),
          lag,
          lagUnit,
        });
      }

      return {
        id: task.sys_id,
        name: task.short_description,
        parentId: task.parent.value,
        startDate: task.start_date,
        endDate: task.end_date,
        parentIndex: parseInt(task.wbs_order),
        percentDone: Math.round(parseInt(task.percent_complete)),
        note: task.description,
        status: task.status,
        override_status: parseInt(task.override_status),
        manuallyScheduled: true,
        expanded: true,
      };
    });

    if (!projectResult?.result[0]) throw new Error("Project data not found");
    const {
      sys_id,
      short_description,
      start_date,
      end_date,
      wbs_order,
      percent_complete,
      description,
      status,
      override_status,
    } = projectResult?.result[0];
    tasks.push({
      id: sys_id,
      name: short_description,
      parentId: null,
      startDate: start_date,
      endDate: end_date,
      parentIndex: parseInt(wbs_order),
      percentDone: Math.round(parseInt(percent_complete)),
      note: description,
      status: status,
      override_status: parseInt(override_status),
      manuallyScheduled: true,
      expanded: true,
    });
    tasks.sort((a, b) => a.parentIndex - b.parentIndex);

    res.send({
      success: true,
      tasksResult,
      tasks: {
        rows: tasks,
      },
      dependencies: {
        rows: dependencies,
      },
    });
  } catch (error) {
    console.error(error);
    res.send({
      success: false,
      message: "There was an error getting the tasks",
    });
  }
});

app.post("/api/sync", async function (req, res) {
  const { requestId, tasks, dependencies } = req.body;
  try {
    const response = { requestId, success: true };
    // if task changes are passed
    if (tasks) {
      const rows = await applyTableChanges("tasks", tasks);
      // if got some new data to update client
      if (rows) {
        response.tasks = { rows };
      }
    }
    // if dependency changes are passed
    if (dependencies) {
      const rows = await applyTableChanges("dependencies", dependencies);
      // if got some new data to update client
      if (rows) {
        response.dependencies = { rows };
      }
    }

    res.send(response);
  } catch (error) {
    console.error(error);
    res.send({
      requestId,
      success: false,
      message: "There was an error syncing the data changes",
    });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

async function applyTableChanges(table, changes) {
  let rows;
  let moreRows;
  if (changes.added) {
    rows = await createOperation(changes.added, table);
  }
  if (changes.updated) {
    moreRows = await updateOperation(changes.updated, table);
  }
  if (changes.removed) {
    await deleteOperation(changes.removed, table);
  }

  // if got some new data to update client
  if (!moreRows) return rows;
  if (moreRows[0] == null) return rows;
  return moreRows;
}

function createOperation(added, table) {
  return Promise.all(
    added.map(async (record) => {
      const { $PhantomId, ...data } = record;

      let result;

      if (table === "tasks") {
        const taskData = {
          short_description: data.name,
          parent: data.parentId,
          start_date: formatDateServiceNow(data.startDate),
          end_date: formatDateServiceNow(data.endDate),
          duration: calculateDuration(data.startDate, data.endDate),
          project: process.env.SERVICENOW_PROJECT_SYS_ID,
          wbs_order: data.parentIndex,
          description: data?.note ? data.note : "",
          status: data.status,
          override_status: data?.override_status
            ? parseInt(data.override_status)
            : 0,
        };

        const createTaskResponse = await fetch(
          `https://${process.env.SERVICENOW_PDI_ID}.service-now.com/api/now/table/pm_project_task`,
          {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              Authorization:
                "Basic " +
                btoa(
                  `${process.env.SERVICENOW_USERNAME}:${process.env.SERVICENOW_PASSWORD}`
                ),
            },
            body: JSON.stringify(taskData),
          }
        );
        const createTaskResJSON = await createTaskResponse.json();
        result = createTaskResJSON?.result;
      }
      if (table === "dependencies") {
        const dependencyData = {
          parent: data.from,
          child: data.to,
          sub_type: bryntumDepTypeToServiceNowDepType(data.type),
          lag: bryntumGanttDepLagToServiceNowDepLag(data.lag, data.lagUnit),
        };

        const createDependencyResponse = await fetch(
          `https://${process.env.SERVICENOW_PDI_ID}.service-now.com/api/now/table/planned_task_rel_planned_task`,
          {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              Authorization:
                "Basic " +
                btoa(
                  `${process.env.SERVICENOW_USERNAME}:${process.env.SERVICENOW_PASSWORD}`
                ),
            },
            body: JSON.stringify(dependencyData),
          }
        );

        const createDependencyResJSON = await createDependencyResponse.json();
        result = createDependencyResJSON?.result;
      }
      // Report to the client that the record identifier has been changed
      return { $PhantomId, id: result?.sys_id };
    })
  );
}

function deleteOperation(deleted, table) {
  return Promise.all(
    deleted.map(async (record) => {
      const { id } = record;

      if (table === "tasks") {
        await fetch(
          `https://${process.env.SERVICENOW_PDI_ID}.service-now.com/api/now/table/pm_project_task/${id}`,
          {
            method: "DELETE",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              Authorization:
                "Basic " +
                btoa(
                  `${process.env.SERVICENOW_USERNAME}:${process.env.SERVICENOW_PASSWORD}`
                ),
            },
          }
        );
      }
      if (table === "dependencies") {
        await fetch(
          `https://${process.env.SERVICENOW_PDI_ID}.service-now.com/api/now/table/planned_task_rel_planned_task/${id}`,
          {
            method: "DELETE",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              Authorization:
                "Basic " +
                btoa(
                  `${process.env.SERVICENOW_USERNAME}:${process.env.SERVICENOW_PASSWORD}`
                ),
            },
          }
        );
      }
    })
  );
}

function updateOperation(updated, table) {
  let result;
  return Promise.all(
    updated.map(async ({ id, ...data }) => {
      let updateBody = {};
      if (table === "tasks") {
        for (const [key, value] of Object.entries(data)) {
          if (bryntumTaskFieldsToServiceNowFields[key]) {
            updateBody[bryntumTaskFieldsToServiceNowFields[key]] = value;
          }
        }

        // format dates and add required ServiceNow duration field
        // 2 possible cases for updating a task date:
        if (updateBody?.start_date && updateBody?.end_date) {
          updateBody.start_date = formatDateServiceNow(data.startDate);
          updateBody.end_date = formatDateServiceNow(data.endDate);
          updateBody.duration = calculateDuration(data.startDate, data.endDate);
          updateBody.percent_complete = `${data.percentDone}`;
        } else if (updateBody?.end_date && updateBody?.duration) {
          const startDate = calcStartDate(
            data.endDate,
            data.duration,
            data?.durationUnit
          );
          updateBody.end_date = formatDateServiceNow(data.endDate);
          updateBody.start_date = startDate;
          updateBody.duration = calculateDuration(startDate, data.endDate);
        }

        const updateTaskRes = await fetch(
          `https://${process.env.SERVICENOW_PDI_ID}.service-now.com/api/now/table/pm_project_task/${id}`,
          {
            method: "PATCH",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              Authorization:
                "Basic " +
                btoa(
                  `${process.env.SERVICENOW_USERNAME}:${process.env.SERVICENOW_PASSWORD}`
                ),
            },
            body: JSON.stringify(updateBody),
          }
        );
        const updateTaskResJSON = await updateTaskRes.json();
      }
      if (table === "dependencies") {
        for (const [key, value] of Object.entries(data)) {
          if (bryntumDependencyFieldsToServiceNowFields[key]) {
            updateBody[bryntumDependencyFieldsToServiceNowFields[key]] = value;
          }
        }

        updateBody.sub_type = bryntumDepTypeToServiceNowDepType(data.type);
        updateBody.lag = bryntumGanttDepLagToServiceNowDepLag(
          data.lag,
          data.lagUnit
        );

        // 1. delete dependency then create new one. In ServiceNow it's a good practice to delete a relationship and create a new one between the correct tasks

        await fetch(
          `https://${process.env.SERVICENOW_PDI_ID}.service-now.com/api/now/table/planned_task_rel_planned_task/${id}`,
          {
            method: "DELETE",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              Authorization:
                "Basic " +
                btoa(
                  `${process.env.SERVICENOW_USERNAME}:${process.env.SERVICENOW_PASSWORD}`
                ),
            },
          }
        );

        const createDependencyResponse = await fetch(
          `https://${process.env.SERVICENOW_PDI_ID}.service-now.com/api/now/table/planned_task_rel_planned_task`,
          {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              Authorization:
                "Basic " +
                btoa(
                  `${process.env.SERVICENOW_USERNAME}:${process.env.SERVICENOW_PASSWORD}`
                ),
            },
            body: JSON.stringify(updateBody),
          }
        );

        const createDependencyResJSON = await createDependencyResponse.json();
        result = createDependencyResJSON?.result;
        // Report to the client that the record identifier has been changed
        return { oldId: id, newId: result?.sys_id };
      }
    })
  );
}
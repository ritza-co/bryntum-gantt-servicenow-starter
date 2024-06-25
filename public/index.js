import { Gantt } from "./gantt.module.js";
import CustomTaskModel from "./lib/CustomTaskModel.js";

const gantt = new Gantt({
  appendTo: "app",
  viewPreset: "year",
  barMargin: 10,
  features: {
    taskEdit: {
      items: {
        generalTab: {
          items: {
            statusField: {
              type: "combo",
              label: "Status",
              name: "status",
              items: ["red", "yellow", "green"],
              required: "true",
            },
            overrideStatusField: {
              type: "checkbox",
              label: "Overide status",
              labelPosition: "before",
              name: "override_status",
            },
          },
        },
      },
    },
  },

  project: {
    eventModelClass: CustomTaskModel,
    taskStore: {
      transformFlatData: true,
    },
    dependencyStore: {
      // Setting to true will ensure this field is included in any update/insert request payload when a Store / Project / CrudManager performs a request
      writeAllFields: true,
    },
    onSync({ response }) {
      if (
        response?.dependencies?.rows.length &&
        response.dependencies.rows[0]?.oldId
      ) {
        const { oldId, newId } = response.dependencies.rows[0];
        // temporarily disable autoSync to avoid sending the change back to the server
        gantt.project.autoSync = false;
        gantt.dependencyStore.getById(oldId).id = newId;
        gantt.project.autoSync = true;
      }
    },
    loadUrl: "http://localhost:1337/api/load",
    autoLoad: true,
    syncUrl: "http://localhost:1337/api/sync",
    autoSync: true,
    // This config enables response validation and dumping of found errors to the browser console.
    // It's meant to be used as a development stage helper only so please set it to false for production.
    validateResponse: true,
  },
  columns: [{ type: "name", field: "name", width: 250 }],
});

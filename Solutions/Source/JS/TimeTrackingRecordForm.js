var Enavate = Enavate || {};
if (!Enavate.TimeTracking) Enavate.TimeTracking = {};
if (!Enavate.TimeTracking.Forms) Enavate.TimeTracking.Forms = {};
if (!Enavate.TimeTracking.Ribbon) Enavate.TimeTracking.Ribbon = {};




Enavate.TimeTracking.Utils = {
    formatDate: function (dateValue) {
        const offset = dateValue.getTimezoneOffset()
        dateValue = new Date(dateValue.getTime() - (offset * 60 * 1000))
        let result = dateValue.toISOString().slice(0, 10);
        return result;
    },

    setLookupField: function (formContext, fieldName, entityName, id, name) {
        let values = [];
        values[0] = {};
        values[0].entityType = entityName;
        values[0].id = id;
        values[0].name = name;

        formContext.getAttribute(fieldName).setValue(values);
    },

    setLookupFieldToCurrentUser: function (formContext, fieldName) {
        var globalContext = Xrm.Utility.getGlobalContext();

        let currentUser = [];
        currentUser[0] = {};
        currentUser[0].entityType = "systemuser";
        currentUser[0].id = globalContext.userSettings.userId;
        currentUser[0].name = globalContext.userSettings.userName;

        formContext.getAttribute(fieldName).setValue(currentUser);
    },

    calcRollupField: function (formContext, strTargetEntitySetName, strTargetRecordId, strTargetFieldName) {
        strTargetRecordId = strTargetRecordId.replace("{", "").replace("}", "");
        let req = new XMLHttpRequest();
        let requestUrl = formContext.context.getClientUrl() + "/api/data/v9.0/CalculateRollupField(Target=@p1,FieldName=@p2)?@p1={'@odata.id':'" + strTargetEntitySetName + "(" + strTargetRecordId + ")'}&@p2='" + strTargetFieldName + "'";

        req.open("GET", requestUrl, false);
        req.setRequestHeader("OData-Version", "4.0");
        req.setRequestHeader("OData-MaxVersion", "4.0");
        req.send();
    }

}

Enavate.TimeTracking.Forms.TimeTrackingRecordForm = {
    formOnLoad: function (executionContext) {
        let formContext = executionContext.getFormContext();
        let currentRecordId = formContext.data.entity.getId();

        let dayRef = formContext.getAttribute("ow_day").getValue();

        let dayId = (dayRef) ? dayRef[0].id : null;

        if (!currentRecordId) {
            Enavate.TimeTracking.Utils.setLookupFieldToCurrentUser(formContext, "ow_employee");
        }

        formContext.getAttribute("ow_date").addOnChange(this.onDateChangeHandler.bind(this));
        formContext.getAttribute("ow_reportedhours").addOnChange(this.onReportHoursChangedHandler.bind(this));
        formContext.data.entity.addOnSave(this.formOnSaveHandler.bind());

        if (dayId) {
            Enavate.TimeTracking.Utils.calcRollupField(formContext, "ow_timetrackingdaies", dayId, "ow_totalhours");
        }
    },

    formOnSaveHandler: function (executionContext) {
        let eventArgs = executionContext.getEventArgs();

        //turn off autosave
        if (eventArgs.getSaveMode() == 70) {
            eventArgs.preventDefault();
            return;
        }

        let formContext = executionContext.getFormContext();
        let id = formContext.data.entity.getId();
        let ttdayRef = formContext.getAttribute("ow_day").getValue();

        if (id && (ttdayRef && ttdayRef.length > 0)) {
            let ttdayId = ttdayRef[0].id;
            setTimeout(() => {
                //thisObject.allowSaveUpdate = false;
                Enavate.TimeTracking.Utils.calcRollupField(formContext, "ow_timetrackingdaies", ttdayId, "ow_totalhours");
                //Xrm.Utility.openEntityForm(entity, id);
                formContext.ui.quickForms.get("Other_Records").refresh();
                //formContext.data.refresh(false);
            }, 500);
        }

    },
    onDateChangeHandler: function (executionContext) {
        this.setDayRecord(executionContext);

        let formContext = executionContext.getFormContext();
        let selectedDate = formContext.getAttribute("ow_date").getValue();

        if (selectedDate) {
            formContext.getControl("ow_project").addPreSearch(this.setProjectLookupFilter);
        } else {

            formContext.getControl("ow_project").removePreSearch(this.setProjectLookupFilter);
        }
    },
    setProjectLookupFilter: function (executionContext) {
        let formContext = executionContext.getFormContext();
        let selectedDate = formContext.getAttribute("ow_date").getValue();
        let selectedType = formContext.getAttribute("ow_type").getText();

        if (selectedType == "Day off" || selectedType == "Sick day") {
            formContext.getControl("ow_project").setVisible(false);
        }
        else {
            formContext.getAttribute("ow_project").setRequiredLevel("required")
        }

        if (selectedDate) {
            let dateStr = Enavate.TimeTracking.Utils.formatDate(selectedDate);
            let filter = `<filter>
                            <filter type="or" >
                                <condition attribute="ow_startdate" operator="le" value="${dateStr}" />
                                <condition attribute="ow_startdate" operator="null" />
                            </filter>
                            <filter type="or" >
                                <condition attribute="ow_enddate" operator="null" />
                                <condition attribute="ow_enddate" operator="ge" value="${dateStr}" />
                            </filter>
                          </filter>`
            formContext.getControl("ow_project").addCustomFilter(filter);
        }
    },
    setDayRecord: function (executionContext) {
        let formContext = executionContext.getFormContext();
        let ttdate = formContext.getAttribute("ow_date").getValue();
        let employeeRef = formContext.getAttribute("ow_employee").getValue();
        let employeeId = (employeeRef && employeeRef.length > 0) ? employeeRef[0].id : null;

        if (ttdate && employeeId) {
            let dateStr = Enavate.TimeTracking.Utils.formatDate(ttdate); //2020-01-01
            console.log(dateStr);

            Xrm.WebApi.retrieveMultipleRecords("ow_timetrackingday", `?$select=ow_name,ow_timetrackingdayid&$filter=ow_date eq ${dateStr} and _ow_employee_value eq ${employeeId}&$top=1`).then(
                function success(result) {
                    if (result.entities.length > 0) {
                        let id = result.entities[0].ow_timetrackingdayid;
                        let name = result.entities[0].ow_name;
                        Enavate.TimeTracking.Utils.setLookupField(formContext, "ow_day", "ow_timetrackingday", id, name);
                    } else {
                        formContext.getAttribute("ow_day").setValue(null);
                    }
                    formContext.getAttribute("ow_day").fireOnChange();
                },
                function (error) {
                    console.log(error.message);
                    // handle error conditions
                }
            );
        }
        else {
            formContext.getAttribute("ow_day").setValue(null);
        }
    },
    onReportHoursChangedHandler: function (executionContext) {
        let formContext = executionContext.getFormContext();
        let reportedhours = formContext.getAttribute("ow_reportedhours").getValue();
        if (reportedhours > 8) {
            formContext.ui.setFormNotification("Please look to 'Reported hours' field. It shouldn`t be more then 8 hours", "WARNING", "HoursNotification");
        }
        else {
            formContext.ui.clearFormNotification("HoursNotification")
        }
    }
}


/*
var parameters = {};
var entity = {};
entity.id = formContext.data.process.getInstanceId();
entity.entityType = "ow_approval";
parameters.entity = entity;
parameters.NewStageName = "Approved";

var ow_SetStageRequest = {
    entity: parameters.entity,
    NewStageName: parameters.NewStageName,

    getMetadata: function () {
        return {
            boundParameter: "entity",
            parameterTypes: {
                "entity": {
                    "typeName": "mscrm.ow_approval",
                    "structuralProperty": 5
                },
                "NewStageName": {
                    "typeName": "Edm.String",
                    "structuralProperty": 1
                }
            },
            operationType: 0,
            operationName: "ow_SetStage"
        };
    }
};

Xrm.WebApi.online.execute(ow_SetStageRequest).then(
    function success(result) {
        if (result.ok) {
            //Success - No Return Data - Do Something
        }
    },
    function (error) {
        Xrm.Utility.alertDialog(error.message);
    }
);

*/
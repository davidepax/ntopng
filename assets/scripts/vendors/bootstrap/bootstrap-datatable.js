/*!
 * Bootstrap Data Table Plugin v1.5.5
 *
 * Author: Jeff Dupont
 * ==========================================================
 * Copyright 2012
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * ==========================================================
 */

(function($) {
  /* DATATABLE CLASS DEFINITION
   * ========================== */
  var DataTable = function(element, options) {
    this.$element = $(element);
    this.options = options;
    this.pendingRequest = null;
    this.enabled = true;
    this.columns = [];
    this.rows = [];
    this.buttons = [];

    const no_results_found = (i18n) ? i18n("no_results_found") : "No Results Found"

    // this needs to be handled better
    this.localStorageId =
      "datatable_" + (options.id || options.url.replace(/\W/gi, "_"));

    // set the defaults for the column options array
    for (var column in this.options.columns) {
      // check sortable
      if (typeof this.options.columns[column].sortable === undefined)
        this.options.columns[column].sortable = true;
    }

    this.$default = this.$element.children().length
      ? this.$element.children()
      : $("<div></div>")
          .addClass("alert alert-danger")
          .html(no_results_found);

    this.$element.addClass("clearfix");

    // clear out the localStorage for this entry
    if (localStorage) {
      localStorage[this.localStorageId] = "false";
    }

    if (
      this.options.tablePreRender &&
      typeof this.options.tablePreRender === "function"
    )
      this.options.tablePreRender.call(this);

    // initialize the toolbar
    _initToolbar.call(this);

    if (this.options.autoLoad === true) this.render();
  };

  DataTable.prototype = {
    constructor: DataTable,

    render: function() {
      var o = this.options,
        $e = this.$element;

      // show loading
      this.loading(true);

      // reset the columns and rows
      this.columns = [];
      this.rows = [];
      this.buttons = [];
      this.$wrapper = undefined;
      this.$table = undefined;
      this.$header = undefined;
      this.$body = undefined;
      this.$footer = undefined;
      this.$pagination = undefined;

      if (this.$toolbar) this.$toolbar.remove();

      // add summary on top
      this.$summary_table = $("<details id='dt-top-summary' open></details>")
        .append("<summary></summary>").append("<div class='details mt-2'><ul></ul></div>");

      // top
      this.$top_details = $("<div></div>").attr("id", "dt-top-details");
      // bottom
      this.$bottom_details = $("<div class='d-flex flex-column'></div>").attr("id", "dt-bottom-details");

      // localize the object
      var that = this;

      // pull in the data from the ajax call
      if (o.debug)
        console.log(
          $.extend({}, o.post, {
            currentPage: o.currentPage,
            perPage: o.perPage,
            sort: o.sort,
            filter: o.filter
          })
        );
      if (o.url !== "") {
        var req_data = typeof o.post === "function" ? o.post() : o.post;

        if (this.pendingRequest) this.pendingRequest.abort();

        this.pendingRequest = $.ajax({
          url: o.url,
          type: "GET",
          dataType: "json",
          data: $.extend({}, req_data, {
            currentPage: o.currentPage,
            perPage: o.perPage,
            sortColumn: o.sort.length > 0 ? o.sort[0][0] : null,
            sortOrder: o.sort.length > 0 ? o.sort[0][1] : null,
            filter: o.filter
          }),
          success: function(res, status, xhr) {
            that.pendingRequest = null;

            if (o.dataAdapter) res = o.dataAdapter(res, o);

            that.resultset = res;
            if (!res || res === undefined || !res.data || (res.data.length == 0 && !o.forceTable)) {
              showError.call(that, res);
              return;
            }

            // clear out the current elements in the container
            $e.empty();

            // set the sort and filter configuration
            o.sort = res.sort;
            o.filter = res.filter;
            o.totalRows = res.totalRows;

            // set the current page if we're forcing it from the server
            if (res.currentPage) o.currentPage = parseInt(res.currentPage);

            // retrieve the saved columns
            _retrieveColumns.call(that, localStorage[that.localStorageId]);

            // append the table
            $e.append(that.table());

            // append the detail boxes
            $e.prepend(that.$top_details);

            if (res.summary != undefined) $e.prepend(that.$summary_table);
            $e.append(that.$bottom_details);

            // render the rest of the table
            if (o.showHeader) that.header();
            if (o.showFooter) that.footer();

            // fill in the table body
            that.body();

            // render table summary
            if (res.summary != undefined) {

              // do a validity check summing all percentages
              if (res.summary.map(s => s.percentage).reduce((acc, curr) => acc + curr) <= 100) {

                // clear the previous state
                const $summary = that.$summary_table.find('summary');
                $summary.empty();

                const colors = ["bg-primary", "bg-secondary", "bg-success", "bg-danger", "bg-warning", "bg-info", "bg-dark"];
                const $progresses = $("<div class='progress'></div>");
                const $list = that.$summary_table.find('div.details > ul');
                $list.empty();

                // create progresses bars
                res.summary.forEach((s) => {

                  const color = colors.pop();

                  const $progress = $(`<div class='progress-bar'></div>`);
                  $progress.attr('role', 'progressbar');
                  $progress.css('width', `${s.percentage}%`);
                  $progress.addClass(color);
                  $progresses.append($progress);

                  const $li = $(`<li></li>`);
                  $li.html(`<i class='fas fa-circle ${color.replace('bg', 'text')}'></i> ${s.label} <span>(${s.percentage}%)</span>`);

                  $list.append($li);

                });

                $summary.append($progresses);
              }

            }

            // render the pagination
            if (o.showTopPagination && that.pagination())
              that.$top_details.append(that.pagination().clone(true));
            if (o.showPagination && that.pagination())
              that.$bottom_details.append(that.pagination().clone(true));

            // update the details for the results
            if (!o.hideDetails) that.details();

            // initialize the toolbar
            _initToolbar.call(that);

            // nearly complete... let the user apply any final adjustments
            if (o.tableCallback && typeof o.tableCallback === "function")
              o.tableCallback.call(that);

            that.loading(false);
          },
          error: function(xhr, status, e) {
            that.pendingRequest = null;
            if (status !== "abort")
              console.error("Datatable: error while loading data: " + e);
            showError.call(that, null, status, e);

            that.loading(false);
          }
        });
      }
    },

    loading: function(show) {
      var $e = this.$element;
      var o = this.options;

      if (o.customLoading) {
        o.customLoading(this, show);
        return;
      }

      if (!this.$loading) {
        this.$loading = $("<div></div>")
          .css({
            position: "absolute",
            top: parseInt($e.position().top) + 5 + (o.loadingYOffset || 0),
            left:
              parseInt($e.position().left) +
              parseInt($e.css("marginLeft")) +
              Math.floor($e.width() / 4),
            width: Math.floor($e.width() / 2) + "px"
          })
          .append(
            $("<div></div>")
              .addClass("progress progress-striped")
              .append(
                $("<div></div>")
                  .addClass(
                    "progress-bar progress-bar-animated progress-bar-info"
                  )
                  .attr("style", "width: 50%")
              )
          )
          .appendTo(document.body);
      }

      if (show) {
        $e.css({ opacity: 0.2 });
      } else {
        $e.css({ opacity: 1 });

        this.$loading.remove();
        this.$loading = undefined;
      }
    },

    toolbar: function() {
      var o = this.options,
        $e = this.$element,
        that = this;

      this.$toolbar = $("<div></div>").addClass(
        "dt-toolbar btn-toolbar ms-auto"
      );

      this.$button_group = $("<div></div>")
        .addClass("btn-group")
        .appendTo(this.$toolbar);

      // add all the custom buttons
      for (var i = 0; i < o.buttons.length; i++) {
        this.buttons.push(o.buttons[i]);
      }

      // attach all buttons to the toolbar
      $.each(this.buttons, function() {
        that.$button_group.append(this);
      });

      // attach the toolbar to the section header
      if (o.sectionHeader) {
        this.$section_header = $(o.sectionHeader);
        this.$section_header.append(this.$toolbar);
      } else if (o.title !== "" && !this.$section_header) {
        this.$section_header = $("<h2></h2>")
          .html(o.title)
          .append(this.$toolbar);
        $e.before(this.$section_header);
      } else {
        if (!this.$toolbar_container) {
          this.$toolbar_container = $("<div></div>").addClass(
            "dt-toolbar-container d-flex"
          );
        }
        $e.prepend(this.$toolbar_container.append(this.$toolbar));
      }

      return this.$toolbar;
    },

    details: function() {
      var o = this.options,
        res = this.resultset,
        start = 0,
        end = 0,
        that = this;

      const showing_x_to_y_rows = (i18n) ? i18n("showing_x_to_y_rows") : "Showing %{x} to %{y} of %{tot} rows"

      start = o.currentPage * o.perPage - o.perPage + 1;
      if (start < 1) start = 1;

      end = o.currentPage * o.perPage;
      if (end > o.totalRows) end = o.totalRows;

      $(
        '<div class="text-left"><p>' +
          showing_x_to_y_rows.sformat(start, end, o.totalRows) +
          "</p></div>"
      ).prependTo(this.$bottom_details);
    },

    table: function() {
      var $e = this.$element,
        o = this.options;

      if (!this.$table_wrapper) {
        this.$wrapper = $("<div></div>").addClass("dt-table-wrapper");
      }

      if (!this.$table) {
        this.$table = $("<table></table>").addClass(o.class);
      }

      this.$wrapper.append(this.$table);
      return this.$wrapper;
    },

    header: function() {
      var o = this.options,
        res = this.resultset;

      if (!this.$header) {
        this.$header = $("<thead></thead>");
        var row = $("<tr></tr>");

        // loop through the columns
        for (var column in o.columns) {
          var $cell = this.column(column),
            colprop = $cell.data("column_properties");

          // attach the sort click event
          if (colprop.sortable && !colprop.custom)
            $cell.click(this, this.sort).css({ cursor: "pointer" });

          for (var i = 0; i < o.sort.length; i++) {
            if (o.sort[i][0] == colprop.field) {
              if (o.sort[i][1] == "asc") {
                $cell.append($(o.ascending));
                colprop.sortOrder = "asc";
              } else if (o.sort[i][1] == "desc") {
                $cell.append($(o.descending));
                colprop.sortOrder = "desc";
              }
            }
          }

          row.append($cell);
          this.$header.append(row);
          this.columns.push($cell);
        }

        // any final user adjustments to the header
        if (o.headerCallback && typeof o.headerCallback === "function")
          o.headerCallback.call(this);

        this.$table.append(this.$header);
      }
      return this.$header;
    },

    footer: function() {
      var o = this.options,
        res = this.resultset;

      if (!this.$footer) {
        this.$footer = $("<tfoot></tfoot>");

        // loop through the columns
        for (column in o.columns) {
          var $cell = $("<td></td>");

          $cell
            .data("cell_properties", o.columns[column])
            .addClass(o.columns[column].classname);

          this.$footer.append($cell);
        }

        // any final user adjustments to the footer
        if (o.footerCallback && typeof o.footerCallback === "function")
          o.footerCallback.call(this, this.resultset.footer);

        this.$table.append(this.$footer);
      }
      return this.$footer;
    },

    body: function() {
      var res = this.resultset,
        o = this.options;

      if (!this.$body) {
        this.$body = $("<tbody></tbody>");

        // loop through the results
        for (var i = 0; i < res.data.length; i++) {
          var row = this.row(res.data[i]);
          this.$body.append(row);
          this.rows.push(row);
        }

        if (o.showFilterRow) this.$body.prepend(this.filter());

        this.$table.append(this.$body);
      }
      return this.$body;
    },

    filter: function() {
      var $row = $("<tr></tr>"),
        o = this.options,
        that = this;

      $row.addClass("dt-filter-row");

      // loop through the columns
      for (var column in o.columns) {
        var $cell = $("<td></td>").addClass(o.columns[column].classname);

        if (o.columns[column].hidden) $cell.hide();

        if (o.columns[column].filter && o.columns[column].field) {
          $cell.append(
            $("<input/>")
              .attr("name", "filter_" + o.columns[column].field)
              .data("filter", o.columns[column].field)
              .val(o.filter[o.columns[column].field] || "")
              // .change(this, this.runFilter)
              .change(function(e) {
                runFilter.call(this, that);
              })
          );
        }

        $row.append($cell);
      }
      return $row;
    },

    row: function(rowdata) {
      var $row = $("<tr></tr>"),
        o = this.options;

      // loop through the columns
      for (var column in o.columns) {
        var cell = this.cell(rowdata, column);
        $row.append(cell);
      }

      // callback for postprocessing on the row
      if (o.rowCallback && typeof o.rowCallback === "function")
        $row = o.rowCallback($row, rowdata);

      return $row;
    },

    cell: function(data, column) {
      var celldata =
          data[this.options.columns[column].field] ||
          this.options.columns[column].custom,
        $cell = $("<td></td>"),
        o = this.options;

      // preprocess on the cell data for a column
      if (
        o.columns[column].callback &&
        typeof o.columns[column].callback === "function"
      )
        celldata = o.columns[column].callback.call(
          $cell,
          data,
          o.columns[column]
        );

      $cell
        .data("cell_properties", o.columns[column])
        .addClass(o.columns[column].classname)
        .append(celldata || "&nbsp;");

      if (o.columns[column].css) $cell.css(o.columns[column].css);

      if (o.columns[column].hidden) $cell.hide();

      return $cell;
    },

    column: function(column) {
      var $cell = $("<th></th>"),
        o = this.options,
        classname =
          "dt-column_" + column + Math.floor(Math.random() * 1000 + 1);

      o.columns[column].classname = classname;

      $cell
        .data("column_properties", o.columns[column])
        .addClass(classname)
        .text(o.columns[column].title);

      if (o.columns[column].css) $cell.css(o.columns[column].css);

      if (o.columns[column].hidden) $cell.hide();

      return $cell;
    },

    sort: function(e) {
      var colprop = $(this).data("column_properties"),
        that = e.data,
        o = e.data.options,
        found = false;

      colprop.sortOrder = colprop.sortOrder
        ? colprop.sortOrder == "asc"
          ? "desc"
          : ""
        : "asc";

      if (o.allowMultipleSort) {
        // does the sort already exist?
        for (var i = 0; i < o.sort.length; i++) {
          if (o.sort[i][0] == colprop.field) {
            o.sort[i][1] = colprop.sortOrder;
            if (colprop.sortOrder === "") o.sort.splice(i, 1);
            found = true;
          }
        }
        if (!found) o.sort.push([colprop.field, colprop.sortOrder]);
      } else {
        // clear out any current sorts
        o.sort = [];
        o.sort.push([colprop.field, colprop.sortOrder]);
      }
      if (o.debug) console.log(o.sort);

      that.render();
    },

    pagination: function() {
      var $e = this.$element,
        that = this,
        o = this.options,
        res = this.resultset;

      // no paging needed
      if (o.perPage >= res.totalRows) return;

      if (!this.$pagination) {
        this.$pagination = $("<div></div>").addClass("ms-auto");

        // how many pages?
        o.pageCount = Math.ceil(res.totalRows / o.perPage);

        // setup the pager container and the quick page buttons
        var $pager = $("<ul></ul>").addClass("pagination"),
          $first = $("<li></li>")
            .addClass("page-item")
            .append(
              $("<a></a>")
                .addClass("page-link")
                .attr("href", "#")
                .data("page", 1)
                .html("&laquo;")
                .click(function() {
                  o.currentPage = 1;
                  that.render();
                  return false;
                })
            ),
          $previous = $("<li></li>")
            .addClass("page-item")
            .append(
              $("<a></a>")
                .addClass("page-link")
                .attr("href", "#")
                .data("page", o.currentPage - 1)
                .html("&lt;")
                .click(function() {
                  o.currentPage -= 1;
                  o.currentPage = o.currentPage >= 1 ? o.currentPage : 1;
                  that.render();
                  return false;
                })
            ),
          $next = $("<li></li>")
            .addClass("page-item")
            .append(
              $("<a></a>")
                .addClass("page-link")
                .attr("href", "#")
                .data("page", o.currentPage + 1)
                .html("&gt;")
                .click(function() {
                  o.currentPage += 1;
                  o.currentPage =
                    o.currentPage <= o.pageCount ? o.currentPage : o.pageCount;
                  that.render();
                  return false;
                })
            ),
          $last = $("<li></li>")
            .addClass("page-item")
            .append(
              $("<a></a>")
                .addClass("page-link")
                .attr("href", "#")
                .data("page", o.pageCount)
                .html("&raquo;")
                .click(function() {
                  o.currentPage = o.pageCount;
                  that.render();
                  return false;
                })
            );

        var totalPages = o.pagePadding * 2,
          start,
          end;

        if (totalPages >= o.pageCount) {
          start = 1;
          end = o.pageCount;
        } else {
          start = o.currentPage - o.pagePadding;
          if (start <= 0) start = 1;

          end = start + totalPages;
          if (end > o.pageCount) {
            end = o.pageCount;
            start = end - totalPages;
          }
        }

        // append the pagination links
        for (var i = start; i <= end; i++) {
          var $link = $("<li></li>")
            .addClass("page-item")
            .append(
              $("<a></a>")
                .addClass("page-link")
                .attr("href", "#")
                .data("page", i)
                .text(i)
                .click(function() {
                  o.currentPage = $(this).data("page");
                  that.render();
                  return false;
                })
            );

          if (i == o.currentPage) $link.addClass("active");

          $pager.append($link);
        }

        // append quick jump buttons
        if (o.currentPage == 1) {
          $first.addClass("disabled");
          $previous.addClass("disabled");
        }
        if (o.currentPage == o.pageCount) {
          $next.addClass("disabled");
          $last.addClass("disabled");
        }
        $pager.prepend($first, $previous);
        $pager.append($next, $last);

        this.$pagination.append($pager);
      }
      return this.$pagination;
    },

    remove: function() {
      var $e = this.$element;

      if (this.$section_header) this.$section_header.remove();

      $e.data("datatable", null);
      $e.empty();
    }
  };

  /* DATATABLE PRIVATE METHODS
   * ========================= */

  function _initToolbar() {
    var o = this.options;

    // create the perpage dropdown
    if (!o.hidePerPage) _initPerPage.call(this);

    // handle filter options
    if (o.filterModal) _initFilterModal.call(this);

    // handle the column management
    // ntop - disabled
    //if(o.toggleColumns)   _initColumnModal.call(this);

    // handle the overflow option
    // ntop - disabled
    // if(o.allowOverflow)   _initOverflowToggle.call(this);

    // initialize the table info
    if (o.allowTableinfo) _initTableInfo.call(this);

    // create the buttons and section functions
    this.toolbar();
  }

  function _initColumnModal() {
    var o = this.options,
      $e = this.$element,
      $top_details = this.$top_details,
      $toggle = $("<a></a>");

    // localize the object
    var that = this;

    if (!this.$column_modal) {
      var randId = Math.floor(Math.random() * 100 + 1);
      this.$column_modal = $("<div></div>")
        .attr("id", "dt-column-modal_" + randId)
        .attr("tabindex", "-1")
        .attr("role", "dialog")
        .attr("aria-labelledby", "dt-column-modal-label_" + randId)
        .attr("aria-hidden", "true")
        .addClass("modal fade")
        .hide();

      // render the modal header
      this.$column_modalheader = $("<div></div>")
        .addClass("modal-header")
        .append(
          $("<button></button>")
            .addClass("close")
            .data("dismiss", "modal")
            .attr("aria-hidden", "true")
            .html("&times;")
            .click(function() {
              that.$column_modal.modal("hide");
            })
        )
        .append(
          $("<h3></h3>")
            .addClass("modal-title")
            .attr("id", "dt-column-modal-label_" + randId)
            .text("Toggle Columns")
        );

      // render the modal footer
      this.$column_modalfooter = $("<div></div>")
        .addClass("modal-footer")
        .append(
          // show the check 'all / none' columns
          $('<div class="float-left"></div>').append(
            $('<div class="btn-group"></div>').append(
              $("<button></button>")
                .addClass("btn btn-info")
                .append(
                  $("<span></span>")
                    .addClass("fas fa-check")
                    .text("All")
                )
                .click(function() {
                  $(this)
                    .closest(".modal")
                    .find("button.on-off")
                    .each(function() {
                      if ($(this).data("column-hidden")) {
                        $(this).click();
                      }
                    });
                  return false;
                }),
              $("<button></button>")
                .addClass("btn btn-warning")
                .append(
                  $("<span></span>")
                    .addClass("glyphicon glyphicon-unchecked")
                    .text("None")
                )
                .click(function() {
                  $(this)
                    .closest(".modal")
                    .find("button.on-off")
                    .each(function() {
                      if (!$(this).data("column-hidden")) {
                        $(this).click();
                      }
                    });
                  return false;
                })
            )
          ),

          o.allowSaveColumns
            ? $("<button></button>")
                .addClass("btn btn-primary")
                .text("Save")
                .click(function() {
                  _saveColumns.call(that);
                  return false;
                })
            : "",

          $("<button></button>")
            .addClass("btn btn-secondary")
            .data("dismiss", "modal")
            .append($("<span></span>"))
            .text("Close")
            .click(function() {
              that.$column_modal.modal("hide");
              return false;
            })
        );

      // render the modal body
      this.$column_modalbody = $("<div></div>").addClass("modal-body");

      this.$column_modaldialog = $("<div></div>")
        .addClass("modal-dialog")
        .append(
          $("<div></div>")
            .addClass("modal-content")
            .append(
              this.$column_modalheader,
              this.$column_modalbody,
              this.$column_modalfooter
            )
        );

      // render and add the modal to the container
      this.$column_modal
        .append(this.$column_modaldialog)
        .appendTo(document.body);
    }
    // render the display modal button
    $toggle
      .addClass("btn")
      .data("toggle", "modal")
      .data("content", "Choose which columns you would like to display.")
      .data("target", "#" + this.$column_modal.attr("id"))
      .attr("href", "#" + this.$column_modal.attr("id"))
      .append($("<span></span>").addClass("fas fa-cog"))
      .click(function(e) {
        that.$column_modal
          .on("show.bs.modal", function() {
            if (o.debug) console.log(that);
            _updateColumnModalBody.call(that, that.$column_modalbody);
          })
          .modal();
        return false;
      })
    this.buttons.unshift($toggle);

    if (o.debug) console.log($toggle);

    return this.$column_modal;
  }

  function _initFilterModal() {
    var o = this.options,
      $e = this.$element,
      $toggle = $("<a></a>");

    // render the display modal button
    $toggle
      .addClass("btn")
      .data("toggle", "modal")
      .attr("href", "#")
      .data("content", "Open the filter dialog.")
      .extend($("<span></span>").addClass("fas fa-filter"))
      .click(function() {
        if ($(o.filterModal).hasClass("modal")) $(o.filterModal).modal();
        else if ($(o.filterModal).is(":visible")) $(o.filterModal).hide();
        else $(o.filterModal).show();

        return false;
      })
    this.buttons.unshift($toggle);
  }

  function _initPerPage() {
      var o = this.options,
	  $e = this.$element,
	  that = this;
    const change_number_of_rows = (i18n) ? i18n("change_number_of_rows") : "Change the number of rows per page"

      // per page options and current filter/sorting
      var $perpage_select = $("<div></div>")
	  .addClass("btn-group")
	  .append($("<button></button>")
		  .addClass("btn btn-link dropdown-toggle")
		  .data("content", change_number_of_rows + ".")
		  .attr("data-bs-toggle", "dropdown")
		  .html(o.perPage + "&nbsp;")
		  .append($("<span></span>")
			  .addClass("caret")));

      var $perpage_values = $("<ul></ul>")
	  .addClass("dropdown-menu scrollable-dropdown")
	  .attr("role", "menu")
	  .append(
	      $(
		  '<li data-value="10"><a class="dropdown-item" href="#">10</a></li>'
	      ).click(function() {
		  _updatePerPage.call(this, that);
		  return false;
	      }),
	      $(
		  '<li data-value="20"><a class="dropdown-item" href="#">20</a></li>'
	      ).click(function() {
		  _updatePerPage.call(this, that);
		  return false;
	      }),
	      $(
		  '<li data-value="50"><a class="dropdown-item" href="#">50</a></li>'
	      ).click(function() {
		  _updatePerPage.call(this, that);
		  return false;
	      }),
	      $(
		  '<li data-value="100"><a class="dropdown-item" href="#">100</a></li>'
	      ).click(function() {
		  _updatePerPage.call(this, that);
		  return false;
	      }),
	      $(
		  '<li data-value="200"><a class="dropdown-item" href="#">200</a></li>'
	      ).click(function() {
		  _updatePerPage.call(this, that);
		  return false;
	      })
	  );

      $perpage_select.append($perpage_values);

      this.buttons.push($perpage_select);
  }

  function _initTableInfo() {
    var o = this.options,
      $e = this.$element,
      $info = $("<a></a>");

    // render the display modal button
    $info
      .addClass("btn")
      .attr("href", "#")
      .append($("<span></span>").addClass("fas fa-info-circle"))
      .click(function() {
        return false;
      });

    var $page_sort = [],
      $page_filter = [];

    // sort
    $.each(o.sort, function(i, v) {
      if (!v.length) return;
      var heading;
      for (var column in o.columns) {
        if (o.columns[column].field == v[0]) heading = o.columns[column].title;
      }
      $page_sort.push(heading + " " + v[1].toUpperCase());
    });

    // filter
    $.each(o.filter, function(k, v) {
      var heading;
      for (var column in o.columns) {
        if (o.columns[column].field == k) heading = o.columns[column].title;
      }
      $page_filter.push((heading || k) + " = '" + v + "'");
    });
    $($info)
      .data(
        "content",
        $("<dl></dl>").append(
          $page_sort.length > 0
            ? '<dt><i class="icon-th-list"></i> Sort:</dt><dd>' +
                $page_sort.join(", ") +
                "</dd>"
            : "",
          $page_filter.length > 0
            ? '<dt><i class="icon-filter"></i> Filter:</dt><dd>' +
                $page_filter.join(", ") +
                "</dd>"
            : ""
        )
      )

    this.buttons.unshift($info);
  }

  function _initOverflowToggle() {
    var o = this.options,
      $wrapper = this.$wrapper,
      $overflow = $("<a></a>");

    // create the button
    $overflow
      .addClass("btn")
      .attr("href", "#")
      .attr(
        "title",
        "Toggle the size of the table to fit the data or to fit the screen."
      )
      .append($("<span></span>").addClass("glyphicon glyphicon-resize-full"))
      .click(function() {
        if ($wrapper) _toggleOverflow.call(this, $wrapper);
        return false;
      });

    if (
      !this.resultset ||
      !this.resultset.data ||
      this.resultset.data.length == 0
    )
      $overflow.addClass("disabled");

    this.buttons.push($overflow);
  }

  function _toggleOverflow(el) {
    if (el.css("overflow") == "scroll") {
      $(this)
        .children("span.glyphicon")
        .attr("class", "glyphicon glyphicon-resize-full");

      el.css({
        overflow: "visible",
        width: "auto"
      });
    } else {
      $(this)
        .children("span.glyphicon")
        .attr("class", "glyphicon glyphicon-resize-small");

      el.css({
        overflow: "scroll",
        width: el.width()
      });
    }
  }

  function _updatePerPage(that) {
    var o = that.options;

    // update the perpage value
    o.perPage = $(this).data("value");

    // the offset
    var offset = o.currentPage * o.perPage;
    while (offset > o.totalRows) {
      o.currentPage--;
      offset = o.currentPage * o.perPage;
    }
    if (o.currentPage < 1) o.currentPage = 1;

    // update the table
    that.render();

    return false;
  }

  function showError(data, status, err_msg) {
    var o = this.options,
      $e = this.$element;

    $e.empty();

    // initialize the toolbar
    _initToolbar.call(this);

    // nearly complete... let the user apply any final adjustments
    if (o.tableCallback && typeof o.tableCallback === "function")
      o.tableCallback.call(this);

    this.loading(false);

    var custom_no_res = null;

    if (o.noResultsCallback) custom_no_res = o.noResultsCallback(this, data);

    if (custom_no_res) {
      $e.append(custom_no_res);
    } else if (err_msg && status != "abort") {
      $e.append(
        $("<div></div>")
          .addClass("alert alert-danger")
          .html(err_msg)
      );
    } else if (data && typeof data.error === "string") {
      $e.append(
        $("<div></div>")
          .addClass("alert alert-danger")
          .html(data.error)
      );
    } else if (o.noResultsMessage) {
      var msg = o.noResultsMessage(this, data);

      $e.append(
        $("<div></div>")
          .addClass("alert alert-danger")
          .html(msg)
      );
    } else if (this.$default) $e.append(this.$default);
  }

  function runFilter(that) {
    var o = that.options;

    o.filter[$(this).data("filter")] = $(this).val();
    if (o.debug) console.log(o.filter);

    that.render();
  }

  function _updateColumnModalBody(body) {
    var o = this.options,
      $container = $("<form></form>").addClass("form-inline"),
      that = this;

    // loop through the columns
    for (var column in o.columns) {
      if (o.columns[column].title === "") continue;
      var $item = $("<div></div></br>")
        .addClass("form-group")
        .append(
          $("<label></label>")
            .addClass("control-label")
            .append(
              o.columns[column].title,

              $("<button></button>")
                .addClass(
                  "on-off btn " +
                    (o.columns[column].hidden ? "btn-info" : "btn-warning")
                )
                .data("column", column)
                .data("column-hidden", o.columns[column].hidden)
                .text(o.columns[column].hidden ? "ON" : "OFF")
                .click(function() {
                  _toggleColumn.call(this, that);
                  return false;
                })
            )
        );
      $container.append($item);
    }

    body.empty();
    body.append($container);
  }

  function _toggleColumn(that) {
    var o = that.options,
      column = $(this).data("column"),
      $column = $("." + o.columns[column].classname);

    if ($column.is(":visible")) {
      $column.hide();
      o.columns[column].hidden = true;
      $(this)
        .removeClass("btn-warning")
        .addClass("btn-info")
        .text("ON")
        .data("column-hidden", true);
    } else {
      $column.show();
      o.columns[column].hidden = false;
      $(this)
        .removeClass("btn-info")
        .addClass("btn-warning")
        .text("OFF")
        .data("column-hidden", false);
    }
    return false;
  }

  function _saveColumns() {
    var o = this.options,
      columns = [];

    // save the columns to the localstorage
    if (localStorage) {
      localStorage[this.localStorageId] = JSON.stringify(o.columns);
    }

    $.ajax({
      url: o.url,
      type: "POST",
      dataType: "json",
      data: $.extend({}, o.post, {
        action: "save-columns",
        columns: JSON.stringify(o.columns),
        sort: JSON.stringify(o.sort),
        filter: JSON.stringify(o.filter)
      }),
      success: function(res) {
        if (o.debug) console.log("columns saved");
      }
    });

    this.$column_modal.modal("hide");
  }

  function _retrieveColumns(data) {
    var o = this.options,
      columns = data ? JSON.parse(data) : [],
      res = this.resultset;

    // if the server doesn't pass the column property back
    if (!res.columns) res.columns = [];

    for (column in o.columns) {
      o.columns[column] = $.extend(
        {},
        o.columns[column],
        res.columns[column],
        columns[column]
      );
    }
  }

  /* DATATABLE PLUGIN DEFINITION
   * =========================== */

  $.fn.datatable = function(options) {
    $.fn.datatable.init.call(this, options, DataTable, "datatable");
    return this;
  };

  $.fn.datatable.init = function(options, Constructor, name) {
    var datatable;

    if (options === true) {
      return this.data(name);
    } else if (typeof options == "string") {
      datatable = this.data(name);
      if (datatable) {
        datatable[options]();
      }
      return this;
    }

    options = $.extend({}, $.fn[name].defaults, options);

    function get(el) {
      var datatable = $.data(el, name);

      if (!datatable) {
        datatable = new Constructor(
          el,
          $.fn.datatable.elementOptions(el, options)
        );
        $.data(el, name, datatable);
      }

      return datatable;
    }

    this.each(function() {
      get(this);
    });

    return this;
  };

  $.fn.datatable.DataTable = DataTable;

  $.fn.datatable.elementOptions = function(el, options) {
    return $.metadata ? $.extend({}, options, $(el).metadata()) : options;
  };

  $.fn.datatable.defaults = {
    debug: false,
    id: undefined,
    title: "Data Table Results",
    class: "table table-striped table-bordered",
    perPage: 10,
    pagePadding: 2,
    sort: [],
    filter: {},
    post: {},
    buttons: [],
    sectionHeader: undefined,
    totalRows: 0,
    currentPage: 1,
    showPagination: true,
    showTopPagination: false,
    showHeader: true,
    showFooter: false,
    showFilterRow: false,
    filterModal: undefined,
    allowExport: false,
    allowOverflow: true,
    allowMultipleSort: false,
    allowSaveColumns: true,
    toggleColumns: true,
    url: "",
    columns: [],
    ascending: $("<span></span>").addClass("fas fa-chevron-up"),
    descending: $("<span></span>").addClass("fas fa-chevron-down"),
    rowCallback: undefined,
    tableCallback: undefined,
    headerCallback: undefined,
    footerCallback: undefined,
    tablePreRender: undefined,
    autoLoad: true
  };
})(window.jQuery);

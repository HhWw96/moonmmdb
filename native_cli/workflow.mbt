///|
#borrow(output, protected_path)
extern "C" fn host_output_check(
  output : Bytes,
  protected_path : Bytes,
  overwrite : Int,
) -> Int = "mm_cli_output_check"

///|
#borrow(path, bytes)
extern "C" fn host_publish(
  path : Bytes,
  bytes : Bytes,
  length : Int,
  overwrite : Int,
) -> Int = "mm_cli_publish"

///|
fn verify_source(expected : Json, actual : Json) -> Unit raise {
  let e = @workflow.obj(expected)
  for key in ["sha256", "bytes"] {
    if e.get(key) is Some(value) && value != @workflow.get(actual, key) {
      fail(
        "source-mismatch",
        "File does not match role " +
        @workflow.str(@workflow.get(expected, "role")),
      )
    }
  }
}

///|
fn execute_task(task : Json, bindings : Map[String, String]) -> Json raise {
  let files = match @workflow.get(task, "files") {
    Array(a) => a
    _ => []
  }
  if files.length() != bindings.length() {
    fail("invalid-binding", "Bind every role exactly once")
  }
  for file in files {
    if !bindings.contains(@workflow.str(@workflow.get(file, "role"))) {
      fail("invalid-binding", "Missing file role")
    }
  }
  let operation = @workflow.str(@workflow.get(task, "operation"))
  let parameters = @workflow.get(task, "parameters")
  let actual_files : Array[Json] = []
  let readers : Map[String, @mmdb.Reader] = Map([])
  let result : Json = if operation == "analyze" {
    let args = [
      "moonmmdb",
      "analyze",
      bindings["city"],
      bindings["asn"],
      bindings["input"],
    ]
    for key, value in @workflow.obj(parameters) {
      if key != "max_json_depth" {
        args.push("--" + key.replace_all(old="_", new="-"))
        args.push(
          match value {
            String(s) => s
            _ => value.stringify()
          },
        )
      }
    }
    let report = analyze_report(args, expected=files)
    for file in files {
      let role = @workflow.str(@workflow.get(file, "role"))
      let source = if role == "input" {
        @workflow.get(report, "input")
      } else {
        @workflow.get(@workflow.get(report, "databases"), role)
      }
      verify_source(file, source)
      actual_files.push({
        "role": role.to_json(),
        "name": @workflow.get(file, "name"),
        "bytes": @workflow.get(source, "bytes"),
        "sha256": @workflow.get(source, "sha256"),
      })
    }
    report
  } else {
    let mut remaining = 268435456
    for file in files {
      let role = @workflow.str(@workflow.get(file, "role"))
      let bytes = read_file(bindings[role], remaining)
      remaining -= bytes.length()
      let source : Json = {
        "role": role.to_json(),
        "name": @workflow.get(file, "name"),
        "bytes": bytes.length().to_string().to_json(),
        "sha256": @crypto.bytes_to_hex_string(@crypto.sha256(bytes)).to_json(),
      }
      verify_source(file, source)
      readers[role] = @mmdb.open_bytes(bytes)
      actual_files.push(source)
    }
    if operation == "validate" {
      readers["database"]
      .validate(decode_data=@workflow.get(parameters, "decode_data") == true, limits={
        max_work: @workflow.integer(
          @workflow.get(parameters, "max_work"),
          1,
          1000000000,
        ),
        max_state_bytes: @workflow.integer(
          @workflow.get(parameters, "max_state_bytes"),
          1,
          268435456,
        ),
      })
      .to_json() catch {
        @mmdb.MmdbError(_) as e => e.to_validation_json()
        e => raise e
      }
    } else {
      let ip = @workflow.str(@workflow.get(parameters, "ip"))
      let paths = @workflow.strings(@workflow.get(parameters, "fields"))
      let selection = @mmdb.prepare_fields(
        if paths.is_empty() {
          [""]
        } else {
          paths
        },
      )
      if operation == "compare" {
        readers["before"]
        .compare_prepared(readers["after"], ip, selection)
        .to_json() catch {
          e => e.to_json()
        }
      } else if paths.is_empty() {
        readers["database"].lookup(ip).to_json() catch {
          e => e.to_json()
        }
      } else {
        readers["database"].project_prepared(ip, selection).to_json() catch {
          e => e.to_json()
        }
      }
    }
  }
  let executed : Json = {
    "format": "moonmmdb-task",
    "version": 1,
    "operation": operation.to_json(),
    "parameters": if operation == "analyze" {
      @workflow.get(result, "parameters")
    } else {
      parameters
    },
    "files": actual_files.to_json(),
  }
  let report : Json = {
    "format": "moonmmdb-report",
    "version": 1,
    "tool": { "name": "MoonMMDB", "version": @mmdb.version().to_json() },
    "task": executed,
    "result": result,
  }
  ignore(@workflow.check_report(report))
  report
}

///|
fn run_workflow(args : Array[String]) -> Int raise {
  let command = args[1]
  let raw = decode(
    read_file(args[2], if command == "run-task" { 65536 } else { 8388608 }),
  )
  let document = @workflow.parse_json(
    strip_bom(raw),
    if command == "run-task" {
      65536
    } else {
      8388608
    },
  )
  let checked = if command == "run-task" {
    @workflow.check_task(document)
  } else {
    @workflow.check_report(document)
  }
  let bindings : Map[String, String] = Map([])
  let mut output : String? = None
  let mut overwrite = false
  let mut i = 3
  while i < args.length() {
    match args[i] {
      "--bind" => {
        if i + 2 >= args.length() ||
          bindings.contains(args[i + 1]) ||
          args[i + 2] == "-" {
          fail("invalid-binding", "Expected unique role and regular file")
        }
        bindings[args[i + 1]] = args[i + 2]
        i += 3
      }
      "--output" => {
        if output is Some(_) || i + 1 >= args.length() {
          fail("host-input-error", "Invalid output option")
        }
        output = Some(args[i + 1])
        i += 2
      }
      "--overwrite" => {
        if overwrite {
          fail("host-input-error", "Duplicate overwrite flag")
        }
        overwrite = true
        i += 1
      }
      _ => fail("host-input-error", "Unknown task option")
    }
  }
  if overwrite && output is None {
    fail("host-input-error", "Overwrite requires output")
  }
  let protected_paths = [args[2]]
  for _, path in bindings {
    protected_paths.push(path)
  }
  fn check_output(path : String) -> Unit raise CliError {
    for protected_path in protected_paths {
      if host_output_check(
          c_path(path),
          c_path(protected_path),
          if overwrite {
            1
          } else {
            0
          },
        ) !=
        0 {
        fail(
          "host-output-error", "Output exists, aliases an input, or is not a regular file",
        )
      }
    }
  }
  if output is Some(path) {
    check_output(path)
  }
  let result : Json = if command == "verify-report" && bindings.is_empty() {
    {
      "status": "checked",
      "level": "internal",
      "recomputed": false,
      "exit_code": 0,
    }
  } else {
    try {
      let task = if command == "run-task" {
        checked
      } else {
        @workflow.get(checked, "task")
      }
      let actual = execute_task(task, bindings)
      if command == "run-task" {
        actual
      } else {
        let comparison = @workflow.parse_json(
          @workflow.report_compare(document.stringify(), actual.stringify()),
          8388608,
        )
        if @workflow.get(comparison, "status") == "error" {
          fail("invalid-workflow", "Report comparison failed")
        }
        comparison
      }
    } catch {
      CliError("source-mismatch", _, _) if command == "verify-report" =>
        {
          "status": "different",
          "level": "source",
          "recomputed": false,
          "exit_code": 1,
          "code": "source-mismatch",
        }
      e => raise e
    }
  }
  let text = result.stringify() + "\n"
  let bytes = @utf8.encode(text[:])
  if bytes.length() > 8388608 {
    fail("report-limit", "Full report exceeds 8 MiB")
  }
  if output is Some(path) {
    check_output(path)
    if host_publish(
        c_path(path),
        bytes,
        bytes.length(),
        if overwrite {
          1
        } else {
          0
        },
      ) !=
      0 {
      fail("host-output-error", "Cannot publish complete report")
    }
  } else {
    write(text)
  }
  let value = @workflow.obj(result).get("result").unwrap_or(result)
  if @workflow.obj(value).get("exit_code") is Some(code) {
    @workflow.integer(code, 0, 2)
  } else {
    match @workflow.get(value, "status") {
      "error" | "invalid" | "incomplete" => 2
      "not_found" | "changed" => 1
      _ => 0
    }
  }
}
